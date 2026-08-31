import { describe, expect, test } from "bun:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { parseChatwootMessages } from "@/modules/chatwoot/messages";
import {
  applyFirstTurnGuard,
  hasAssistantMessage,
  hasVisibleOutgoingMessage,
  turnCalledTool,
} from "@/modules/first-turn/guard";
import {
  FIRST_TURN_GUARD_DEFAULTS,
  FIRST_TURN_PREFIX_MAX,
  readFirstTurnGuardConfig,
} from "@/modules/first-turn/settings";
import { decideObjectionGuard } from "@/modules/objection-guard/guard";
import type { ObjectionGuardConfig } from "@/modules/objection-guard/settings";

const config = { enabled: true, prefix: "Apresentação oficial." };

describe("first-turn guard", () => {
  test("prepends the literal prefix and preserves the generated reply", () => {
    expect(
      applyFirstTurnGuard({
        config,
        reply: "Qual é o seu nome completo?",
        firstTurn: true,
        excluded: false,
      }),
    ).toEqual({
      reply: "Apresentação oficial.\n\nQual é o seu nome completo?",
      applied: true,
    });
  });

  test("does not trim or otherwise rewrite the generated reply", () => {
    expect(
      applyFirstTurnGuard({
        config,
        reply: "  Qual é o seu nome completo?  ",
        firstTurn: true,
        excluded: false,
      }),
    ).toEqual({
      reply: "Apresentação oficial.\n\n  Qual é o seu nome completo?  ",
      applied: true,
    });
  });

  test("does not duplicate an exact prefix", () => {
    const reply = "Apresentação oficial.\n\nQual é o seu nome completo?";
    expect(
      applyFirstTurnGuard({
        config,
        reply,
        firstTurn: true,
        excluded: false,
      }),
    ).toEqual({ reply, applied: false });
  });

  test("leaves later turns and Block 2 exceptions unchanged", () => {
    for (const input of [
      { firstTurn: false, excluded: false },
      { firstTurn: true, excluded: true },
    ]) {
      expect(
        applyFirstTurnGuard({
          config,
          reply: "Entendi. Agradeço pelo retorno.",
          ...input,
        }),
      ).toEqual({
        reply: "Entendi. Agradeço pelo retorno.",
        applied: false,
      });
    }
  });

  test("recognizes only public outgoing Chatwoot messages", () => {
    const incoming = parseChatwootMessages({
      payload: [{ id: 1, content: "oi", message_type: 0, private: false }],
    });
    const privateNote = parseChatwootMessages({
      payload: [{ id: 2, content: "nota", message_type: 1, private: true }],
    });
    const outgoing = parseChatwootMessages({
      payload: [{ id: 3, content: "olá", message_type: 1, private: false }],
    });
    expect(hasVisibleOutgoingMessage(incoming)).toBe(false);
    expect(hasVisibleOutgoingMessage(privateNote)).toBe(false);
    expect(hasVisibleOutgoingMessage(outgoing)).toBe(true);
  });

  test("detects prior assistant messages and current-turn exception tools", () => {
    expect(hasAssistantMessage([new HumanMessage("oi")])).toBe(false);
    expect(
      hasAssistantMessage([
        new HumanMessage("oi"),
        new AIMessage("resposta visível"),
      ]),
    ).toBe(true);

    const messages = [
      new HumanMessage("não tenho interesse"),
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call-1", name: "resolve_conversation", args: {} }],
      }),
      new AIMessage("Entendi. Agradeço pelo retorno."),
    ];
    expect(turnCalledTool(messages, new Set(["resolve_conversation"]))).toBe(
      true,
    );
    expect(turnCalledTool(messages, new Set(["handoff_to_human"]))).toBe(false);
  });
});

describe("first-turn guard settings", () => {
  test("defaults off and only enables with a non-blank prefix", () => {
    expect(readFirstTurnGuardConfig({})).toEqual(FIRST_TURN_GUARD_DEFAULTS);
    expect(
      readFirstTurnGuardConfig({
        firstTurnGuard: { enabled: true, prefix: "   " },
      }),
    ).toEqual(FIRST_TURN_GUARD_DEFAULTS);
  });

  test("trims and bounds the configured prefix", () => {
    const read = readFirstTurnGuardConfig({
      firstTurnGuard: {
        enabled: true,
        prefix: `  ${"x".repeat(FIRST_TURN_PREFIX_MAX + 20)}  `,
      },
    });
    expect(read.enabled).toBe(true);
    expect(read.prefix).toHaveLength(FIRST_TURN_PREFIX_MAX);
  });
});

const objectionConfig: ObjectionGuardConfig = {
  enabled: true,
  openObjectionPatterns: [
    "está caro",
    "não sei se vale a pena",
    "tenho dúvida",
    "não tenho certeza",
  ],
  definitiveRefusalPatterns: [
    "não tenho interesse",
    "não quero",
    "vou pensar e depois vejo",
    "vou deixar para depois",
    "parem de me mandar mensagem",
  ],
};

describe("objection guard", () => {
  test.each([
    "Está caro, não sei se vale a pena.",
    "ESTA CARO!",
    "Tenho dúvida sobre o pagamento.",
  ])("blocks an open objection: %s", (message) => {
    expect(decideObjectionGuard(objectionConfig, message)).toBe(
      "blocked_open_objection",
    );
  });

  test.each([
    "Não tenho interesse.",
    "Vou pensar e depois vejo.",
    "Está caro e não tenho interesse.",
    "Parem de me mandar mensagem.",
  ])("allows a definitive refusal or opt-out: %s", (message) => {
    expect(decideObjectionGuard(objectionConfig, message)).toBe("allow");
  });

  test("does nothing while disabled", () => {
    expect(
      decideObjectionGuard(
        { ...objectionConfig, enabled: false },
        "Está caro.",
      ),
    ).toBe("allow");
  });
});
