import { ToolMessage } from "@langchain/core/messages";
import type {
  StructuredToolInterface,
  ToolRunnableConfig,
} from "@langchain/core/tools";
import type { ObjectionGuardConfig } from "./settings";

export type ObjectionGuardDecision = "allow" | "blocked_open_objection";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesPattern(text: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const candidate = normalize(pattern);
    return candidate.length > 0 && text.includes(candidate);
  });
}

export function decideObjectionGuard(
  config: ObjectionGuardConfig | undefined,
  customerText: string,
): ObjectionGuardDecision {
  // Older callers and narrow test fixtures can omit newly introduced settings. Missing config is
  // the same as the feature's opt-in default: disabled.
  if (!config?.enabled) return "allow";
  const text = normalize(customerText);
  if (!text) return "allow";
  if (includesPattern(text, config.definitiveRefusalPatterns)) return "allow";
  return includesPattern(text, config.openObjectionPatterns)
    ? "blocked_open_objection"
    : "allow";
}

const BLOCKED_MESSAGE =
  "Resolution blocked: the contact expressed an open objection, not a definitive refusal. Address the objection once without pressure and do not close the conversation in this turn.";

export function applyObjectionGuard(params: {
  tools: StructuredToolInterface[];
  config: ObjectionGuardConfig | undefined;
  customerText: string;
  onBlocked?: () => void;
}): StructuredToolInterface[] {
  const { tools, config, customerText, onBlocked } = params;
  if (decideObjectionGuard(config, customerText) === "allow") return tools;
  return tools.map((inner) => {
    if (inner.name !== "resolve_conversation") return inner;
    const guarded = Object.create(inner) as StructuredToolInterface;
    guarded.invoke = (async (
      input: unknown,
      runConfig?: ToolRunnableConfig,
    ) => {
      onBlocked?.();
      const id =
        (input as { type?: string; id?: string } | null)?.type === "tool_call"
          ? (input as { id?: string }).id
          : runConfig?.toolCall?.id;
      if (!id) return BLOCKED_MESSAGE;
      return new ToolMessage({
        content: BLOCKED_MESSAGE,
        tool_call_id: id,
        name: inner.name,
      });
    }) as StructuredToolInterface["invoke"];
    return guarded;
  });
}
