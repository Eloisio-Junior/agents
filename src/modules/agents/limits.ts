// Per-agent runtime limits, read from agent.settings.limits (Json, additive). Currently only
// maxToolCalls: the soft+hard cap on tool executions within a SINGLE turn. The graph counts tool
// executions since the last customer message; at maxToolCalls-2 it nudges the model to wrap up, and
// at maxToolCalls it invokes the model WITHOUT tools so the turn always ends in a text answer
// instead of hitting LangGraph's GraphRecursionError. Mirrors readDebounceConfig / readSttConfig.

export interface LimitsConfig {
  maxToolCalls: number;
}

export const DEFAULT_MAX_TOOL_CALLS = 10;
const MIN_TOOL_CALLS = 1;
const MAX_TOOL_CALLS = 50;

export function readLimitsConfig(settings: unknown): LimitsConfig {
  const def: LimitsConfig = { maxToolCalls: DEFAULT_MAX_TOOL_CALLS };
  if (!settings || typeof settings !== "object") return def;
  const l = (settings as Record<string, unknown>).limits;
  if (!l || typeof l !== "object") return def;
  const v = (l as Record<string, unknown>).maxToolCalls;
  if (typeof v !== "number" || !Number.isFinite(v)) return def;
  return {
    maxToolCalls: Math.min(
      MAX_TOOL_CALLS,
      Math.max(MIN_TOOL_CALLS, Math.round(v)),
    ),
  };
}
