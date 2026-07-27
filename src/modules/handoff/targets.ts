import type { ChatwootClient } from "@/modules/chatwoot/client";

// Live agents + teams of a Chatwoot instance, used to GROUND the agent_choice handoff: the names are
// surfaced in the tool description (so the model picks a real one instead of guessing) and resolve
// the model's pick back to a Chatwoot id.
export interface HandoffTargets {
  agents: Array<{ id: number; name: string }>;
  teams: Array<{ id: number; name: string }>;
}

// Per-instance TTL cache so a bursty inbox in agent_choice mode does not re-list agents/teams on
// every turn. The TTL is short, so an operator who adds a team sees it reflected within the window.
const TTL_MS = 60_000;
const cache = new Map<string, { value: HandoffTargets; expires: number }>();

// Fetches (and caches) an instance's agents + teams. `cacheKey` must identify the Chatwoot instance
// (e.g. `${tenantId}:${instanceId}`); `now` is injectable for tests. Does NOT swallow errors — the
// caller treats a throw as "no targets" (the tool still works, just ungrounded).
export async function loadHandoffTargets(
  client: ChatwootClient,
  cacheKey: string,
  now: number = Date.now(),
): Promise<HandoffTargets> {
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now) return hit.value;
  const [agents, teams] = await Promise.all([
    client.listAgents(),
    client.listTeams(),
  ]);
  const value: HandoffTargets = { agents, teams };
  cache.set(cacheKey, { value, expires: now + TTL_MS });
  return value;
}

// Case-insensitive name → target match (agents first, then teams). Pure; null when nothing matches.
export function matchHandoffTarget(
  targets: HandoffTargets,
  name: string,
): { kind: "agent" | "team"; id: number; name: string } | null {
  const lc = name.trim().toLowerCase();
  if (!lc) return null;
  const agent = targets.agents.find((a) => a.name.toLowerCase() === lc);
  if (agent) return { kind: "agent", id: agent.id, name: agent.name };
  const team = targets.teams.find((tm) => tm.name.toLowerCase() === lc);
  if (team) return { kind: "team", id: team.id, name: team.name };
  return null;
}

// Test-only: drop all cached entries so cases don't leak TTL state into one another.
export function __resetHandoffTargetsCache(): void {
  cache.clear();
}
