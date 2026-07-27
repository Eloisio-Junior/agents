import { describe, expect, test } from "bun:test";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph";
import { z } from "zod";
import { buildAgentGraph } from "@/graph/graph";

// Records the messages handed to the model on each invoke (the only thing agentNode does with it).
class RecordingModel {
  seen: BaseMessage[][] = [];
  async invoke(messages: BaseMessage[]): Promise<AIMessage> {
    this.seen.push(messages);
    return new AIMessage("ok");
  }
}

// Regression for the production follow-up bug: agentNode must hand the model EXACTLY ONE system
// message, first. A proactive nudge used to be injected as a SystemMessage; combined with the
// per-turn system prompt that produced [system, …, system], which strict providers (Google) reject
// with "System messages are only permitted as the first passed message". The node now strips any
// system message from the history before prepending the prompt — auto-healing old threads too.
describe("agentNode system-message normalization", () => {
  test("prepends one system prompt and drops a system message leaked into history", async () => {
    const model = new RecordingModel();
    const graph = buildAgentGraph({
      model: model as unknown as BaseChatModel,
      systemPrompt: "PROMPT",
      checkpointer: new MemorySaver(),
    });
    await graph.invoke(
      {
        messages: [
          new SystemMessage("OLD NUDGE"),
          new HumanMessage("oi"),
          new AIMessage("olá"),
          new HumanMessage("tudo bem?"),
        ],
      },
      { configurable: { thread_id: "t1" } },
    );
    const seen = model.seen[0];
    expect(seen).toBeDefined();
    if (!seen) return;
    const systems = seen.filter((m) => m.getType() === "system");
    expect(systems).toHaveLength(1);
    expect(seen[0]?.getType()).toBe("system");
    expect(seen[0]?.content).toBe("PROMPT");
    // the leaked nudge text is gone, the rest of the history is preserved in order
    expect(seen.some((m) => m.content === "OLD NUDGE")).toBe(false);
    expect(seen.slice(1).map((m) => m.content)).toEqual([
      "oi",
      "olá",
      "tudo bem?",
    ]);
  });
});

// A model that keeps calling a tool while tools are bound, and answers in text when they are NOT
// (the hard-limit path invokes the raw model). Records the system prompt seen on each bound invoke.
class ToolLoopModel {
  boundSystemPrompts: string[] = [];
  rawInvokes = 0;
  // Hard-limit path: raw model, no tools → a plain text answer ends the turn.
  async invoke(_messages: BaseMessage[]): Promise<AIMessage> {
    this.rawInvokes++;
    return new AIMessage("resposta final");
  }
  bindTools(_tools: unknown) {
    const self = this;
    let n = 0;
    return {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        n++;
        self.boundSystemPrompts.push(String(messages[0]?.content ?? ""));
        return new AIMessage({
          content: "",
          tool_calls: [{ name: "noop", args: {}, id: `call_${n}` }],
        });
      },
    };
  }
}

const noopTool = tool(async () => "feito", {
  name: "noop",
  description: "noop",
  schema: z.object({}),
});

describe("agentNode tool-call limit (soft+hard)", () => {
  test("forces a no-tools answer at the hard limit and fires onToolLimit", async () => {
    const model = new ToolLoopModel();
    const hits: Array<{ maxToolCalls: number; toolCalls: number }> = [];
    const graph = buildAgentGraph({
      model: model as unknown as BaseChatModel,
      systemPrompt: "PROMPT",
      checkpointer: new MemorySaver(),
      tools: [noopTool],
      maxToolCalls: 3,
      onToolLimit: (info) => hits.push(info),
    });
    const result = await graph.invoke(
      { messages: [new HumanMessage("faça muitas coisas")] },
      { configurable: { thread_id: "limit-1" } },
    );
    // Ended in a text answer (the raw model), not a GraphRecursionError.
    const last = result.messages.at(-1);
    expect(last?.content).toBe("resposta final");
    expect(model.rawInvokes).toBe(1);
    // Hard limit fired exactly once, at maxToolCalls executions.
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({ maxToolCalls: 3, toolCalls: 3 });
    // The soft "wrap up" instruction was appended once the budget got close (N-2 = 1 execution in).
    expect(
      model.boundSystemPrompts.some((p) =>
        p.includes("[Sistema] Você já usou"),
      ),
    ).toBe(true);
    // The first invoke (0 executions) used the plain prompt.
    expect(model.boundSystemPrompts[0]).toBe("PROMPT");
  });
});
