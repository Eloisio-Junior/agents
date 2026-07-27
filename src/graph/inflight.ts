// In-memory registry of agent turns currently executing, keyed by the per-conversation chatwoot
// thread id (`tenant:instance:conversationId`). A turn marks itself in-flight around the LLM invoke
// + post (runLoadedTurn); the follow-up handler consults it to avoid firing a proactive nudge in the
// MIDDLE of a long turn (a short follow-up delay can otherwise elapse while the model is still
// thinking/calling tools, so the nudge would race the agent's own reply).
//
// Safe under the single-replica / one-leader invariant: the webhook turn and the scheduler worker
// share this process, so they share this Set. Not durable by design — a process restart clears it,
// after which the next sweep re-evaluates purely from the persisted watermarks (lastEventAt /
// lastFollowUpAt). At worst a restart mid-turn drops the guard for that one turn.
const inFlight = new Set<string>();

export function markTurnInFlight(threadId: string): void {
  inFlight.add(threadId);
}

export function clearTurnInFlight(threadId: string): void {
  inFlight.delete(threadId);
}

export function isTurnInFlight(threadId: string): boolean {
  return inFlight.has(threadId);
}
