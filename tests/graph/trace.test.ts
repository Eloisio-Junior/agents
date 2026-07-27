import { describe, expect, test } from "bun:test";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { buildPlaygroundTrace, collectTraceSources } from "@/graph/trace";

// Pure shaping tests (no DB / no model): a tool-calling turn must produce a tool_call → tool_result
// pair, surface the search_knowledge sources from the ToolMessage artifact, flag errors, exclude the
// final reply, and scrub anything secret-shaped from args/output.

describe("buildPlaygroundTrace", () => {
  test("shapes a search_knowledge call + result with sources, excludes the reply", () => {
    const messages = [
      new HumanMessage("qual o horário?"),
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "search_knowledge", args: { query: "horário" }, id: "c1" },
        ],
      }),
      new ToolMessage({
        content: "[1] (source: FAQ) Abrimos às 9h",
        tool_call_id: "c1",
        name: "search_knowledge",
        artifact: {
          sources: [
            { marker: "[1]", chunkId: "42", kb: "FAQ", title: "Horários" },
          ],
        },
      }),
      new AIMessage("Abrimos às 9h [1]."),
    ];

    const trace = buildPlaygroundTrace(messages);
    expect(trace).toHaveLength(2);

    const call = trace[0];
    expect(call?.type).toBe("tool_call");
    if (call?.type === "tool_call") {
      expect(call.name).toBe("search_knowledge");
      expect((call.args as { query: string }).query).toBe("horário");
    }

    const result = trace[1];
    expect(result?.type).toBe("tool_result");
    if (result?.type === "tool_result") {
      expect(result.isError).toBe(false);
      expect(result.sources?.[0]?.kb).toBe("FAQ");
      expect(result.sources?.[0]?.title).toBe("Horários");
    }

    // The final assistant reply is NOT part of the trace (surfaced separately as `reply`).
    expect(trace.some((e) => e.type === "assistant")).toBe(false);

    const sources = collectTraceSources(trace);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.chunkId).toBe("42");
  });

  test("flags a tool error and redacts secret-shaped values from args + output", () => {
    const messages = [
      new HumanMessage("cobra o cliente"),
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "charge_customer",
            args: { amount: 100, api_key: "sk-abcdef0123456789abcd" },
            id: "c2",
          },
        ],
      }),
      new ToolMessage({
        content: "HTTP 401 Authorization: Bearer sk-abcdef0123456789abcd",
        tool_call_id: "c2",
        name: "charge_customer",
        status: "error",
      }),
      new AIMessage("Não consegui concluir a cobrança."),
    ];

    const trace = buildPlaygroundTrace(messages);
    const call = trace.find((e) => e.type === "tool_call");
    const json = JSON.stringify(trace);
    // The raw secret material never appears anywhere in the serialized trace.
    expect(json).not.toContain("sk-abcdef0123456789abcd");
    // The credential-named key is dropped wholesale.
    if (call?.type === "tool_call") {
      expect((call.args as { api_key: string }).api_key).not.toContain("sk-");
    }
    const result = trace.find((e) => e.type === "tool_result");
    expect(result?.type === "tool_result" && result.isError).toBe(true);
  });

  test("a plain reply with no tool calls yields an empty trace", () => {
    const messages = [new HumanMessage("oi"), new AIMessage("Olá! Tudo bem?")];
    expect(buildPlaygroundTrace(messages)).toHaveLength(0);
  });

  test("restricts to the latest turn (ignores prior history)", () => {
    const messages = [
      new HumanMessage("turno antigo"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "old_tool", args: {}, id: "old" }],
      }),
      new ToolMessage({
        content: "old",
        tool_call_id: "old",
        name: "old_tool",
      }),
      new AIMessage("resposta antiga"),
      new HumanMessage("turno novo"),
      new AIMessage("resposta nova sem ferramentas"),
    ];
    // Only the latest turn (after the 2nd human message) is considered → no tool entries.
    expect(buildPlaygroundTrace(messages)).toHaveLength(0);
  });

  test("a follow-up turn opens on the injected nudge SystemMessage, not a human", () => {
    const messages = [
      new HumanMessage("oi"),
      new AIMessage("Olá! Como posso ajudar?"),
      // The follow-up injects a system nudge instead of a human message.
      new SystemMessage("An external system event just occurred…"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "check_status", args: {}, id: "f1" }],
      }),
      new ToolMessage({
        content: "pendente",
        tool_call_id: "f1",
        name: "check_status",
      }),
      new AIMessage("Passando para saber se ainda precisa de algo."),
    ];
    // The turn must start AFTER the nudge — only the follow-up's own tool call/result, never the
    // prior turn's "Olá!" assistant reply.
    const trace = buildPlaygroundTrace(messages);
    expect(trace).toHaveLength(2);
    expect(trace[0]?.type).toBe("tool_call");
    expect(trace.some((e) => e.type === "assistant")).toBe(false);
  });
});
