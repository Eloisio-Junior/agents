import { describe, expect, test } from "bun:test";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { rebuildPlaygroundTurns } from "@/modules/playground/sessions";

// Pure reconstruction of a checkpointer message list into display turns. No DB / no checkpointer.

describe("rebuildPlaygroundTurns", () => {
  test("rebuilds user + assistant turns in order", () => {
    const turns = rebuildPlaygroundTurns([
      new HumanMessage("oi"),
      new AIMessage("Olá!"),
      new HumanMessage("tudo bem?"),
      new AIMessage("Tudo!"),
    ]);
    expect(turns.map((x) => [x.role, x.text])).toEqual([
      ["user", "oi"],
      ["assistant", "Olá!"],
      ["user", "tudo bem?"],
      ["assistant", "Tudo!"],
    ]);
  });

  test("unwraps an audio message and flags it", () => {
    const turns = rebuildPlaygroundTurns([
      new HumanMessage("<mensagem-de-audio>quero agendar</mensagem-de-audio>"),
      new AIMessage("Claro!"),
    ]);
    expect(turns[0]).toMatchObject({
      role: "user",
      text: "quero agendar",
      audio: true,
    });
    expect(turns[1]).toMatchObject({ role: "assistant", text: "Claro!" });
  });

  test("a system nudge yields a follow-up reply; a silent one is skipped", () => {
    const turns = rebuildPlaygroundTurns([
      new HumanMessage("oi"),
      new AIMessage("Olá!"),
      new SystemMessage("nudge…"),
      new AIMessage("Ainda precisa de algo?"),
    ]);
    expect(turns).toHaveLength(3);
    expect(turns[2]).toMatchObject({
      role: "assistant",
      text: "Ainda precisa de algo?",
      followup: true,
    });

    const silent = rebuildPlaygroundTurns([
      new HumanMessage("oi"),
      new AIMessage("Olá!"),
      new SystemMessage("nudge…"),
    ]);
    expect(silent).toHaveLength(2);
  });

  test("exposes the message id of each turn (for joining persisted media)", () => {
    const turns = rebuildPlaygroundTurns([
      new HumanMessage({ content: "oi", id: "h1" }),
      new AIMessage({ content: "Olá!", id: "a1" }),
    ]);
    expect(turns[0]?.messageId).toBe("h1");
    expect(turns[1]?.messageId).toBe("a1");
  });

  test("a tool-calling turn carries its trace on the assistant turn, not the user turn", () => {
    const turns = rebuildPlaygroundTurns([
      new HumanMessage("horário?"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "search_knowledge", args: {}, id: "c1" }],
      }),
      new ToolMessage({
        content: "abre 9h",
        tool_call_id: "c1",
        name: "search_knowledge",
      }),
      new AIMessage("Abre às 9h."),
    ]);
    expect(turns[0]).toMatchObject({ role: "user", text: "horário?" });
    expect(turns[0]?.trace).toHaveLength(0);
    expect(turns[1]?.role).toBe("assistant");
    expect((turns[1]?.trace.length ?? 0) > 0).toBe(true);
  });
});
