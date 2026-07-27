import { randomUUID } from "node:crypto";

// Playground thread key: tenantId:playground:agentId:uuid. The tenantId prefix is the checkpointer's
// tenant fence; the "playground" + agentId segments isolate it from real conversations AND from other
// agents. A client-supplied threadId is honored ONLY if it matches this exact shape (so a caller can
// never pass a real conversation's thread to read its history through the playground).

const PLAYGROUND = "playground";

export function newPlaygroundThreadId(
  tenantId: bigint,
  agentId: bigint,
): string {
  return `${tenantId}:${PLAYGROUND}:${agentId}:${randomUUID()}`;
}

export function isValidPlaygroundThread(
  threadId: string,
  tenantId: bigint,
  agentId: bigint,
): boolean {
  const parts = threadId.split(":");
  return (
    parts.length === 4 &&
    parts[0] === String(tenantId) &&
    parts[1] === PLAYGROUND &&
    parts[2] === String(agentId)
  );
}
