import type { BaseMessage } from "@langchain/core/messages";
import type { ChatwootMessageRow } from "@/modules/chatwoot/messages";
import type { FirstTurnGuardConfig } from "./settings";

export interface FirstTurnGuardDecision {
  reply: string;
  applied: boolean;
}

export function hasVisibleOutgoingMessage(
  messages: readonly ChatwootMessageRow[],
): boolean {
  return messages.some(
    (message) => message.messageType === "outgoing" && !message.private,
  );
}

export function hasAssistantMessage(messages: readonly BaseMessage[]): boolean {
  return messages.some((message) => {
    const type = message.getType();
    return type === "ai" && String(message.content ?? "").trim().length > 0;
  });
}

export function turnCalledTool(
  messages: readonly BaseMessage[],
  names: ReadonlySet<string>,
): boolean {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.getType() === "human") {
      start = i + 1;
      break;
    }
  }
  for (const message of messages.slice(start)) {
    if (message.getType() !== "ai") continue;
    const calls = (
      message as unknown as { tool_calls?: Array<{ name?: string }> }
    ).tool_calls;
    if (calls?.some((call) => !!call.name && names.has(call.name))) return true;
  }
  return false;
}

export function applyFirstTurnGuard(params: {
  config: FirstTurnGuardConfig;
  reply: string;
  firstTurn: boolean;
  excluded: boolean;
}): FirstTurnGuardDecision {
  const { config, firstTurn, excluded } = params;
  const { reply } = params;
  if (
    !config.enabled ||
    !config.prefix ||
    !reply.trim() ||
    !firstTurn ||
    excluded ||
    reply.startsWith(config.prefix)
  ) {
    return { reply, applied: false };
  }
  return { reply: `${config.prefix}\n\n${reply}`, applied: true };
}

