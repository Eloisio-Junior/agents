import { describe, expect, test } from "bun:test";
import type { ChatwootClient } from "@/modules/chatwoot/client";
import {
  __resetHandoffTargetsCache,
  loadHandoffTargets,
  matchHandoffTarget,
} from "@/modules/handoff/targets";

describe("matchHandoffTarget", () => {
  const targets = {
    agents: [{ id: 9, name: "Maria" }],
    teams: [{ id: 2, name: "Vendas" }],
  };
  test("matches an agent case-insensitively", () => {
    expect(matchHandoffTarget(targets, "maria")).toEqual({
      kind: "agent",
      id: 9,
      name: "Maria",
    });
  });
  test("matches a team", () => {
    expect(matchHandoffTarget(targets, "VENDAS")?.kind).toBe("team");
  });
  test("agents win over teams on a name clash", () => {
    const t = {
      agents: [{ id: 1, name: "Dup" }],
      teams: [{ id: 2, name: "Dup" }],
    };
    expect(matchHandoffTarget(t, "dup")).toEqual({
      kind: "agent",
      id: 1,
      name: "Dup",
    });
  });
  test("returns null when nothing matches or the name is blank", () => {
    expect(matchHandoffTarget(targets, "Ninguém")).toBeNull();
    expect(matchHandoffTarget(targets, "   ")).toBeNull();
  });
});

describe("loadHandoffTargets", () => {
  function makeClient(agents: unknown[], teams: unknown[]) {
    let agentCalls = 0;
    let teamCalls = 0;
    const client = {
      listAgents: async () => {
        agentCalls++;
        return agents;
      },
      listTeams: async () => {
        teamCalls++;
        return teams;
      },
    } as unknown as ChatwootClient;
    return { client, counts: () => ({ agentCalls, teamCalls }) };
  }

  test("caches per key within the TTL and refetches after it expires", async () => {
    __resetHandoffTargetsCache();
    const { client, counts } = makeClient(
      [{ id: 1, name: "A" }],
      [{ id: 2, name: "T" }],
    );
    const r1 = await loadHandoffTargets(client, "t:1", 1_000);
    expect(r1.agents).toHaveLength(1);
    expect(counts()).toEqual({ agentCalls: 1, teamCalls: 1 });
    // Within TTL → cache hit, no extra fetch.
    await loadHandoffTargets(client, "t:1", 1_000 + 30_000);
    expect(counts()).toEqual({ agentCalls: 1, teamCalls: 1 });
    // After TTL → refetch.
    await loadHandoffTargets(client, "t:1", 1_000 + 61_000);
    expect(counts()).toEqual({ agentCalls: 2, teamCalls: 2 });
  });

  test("keys the cache separately per instance", async () => {
    __resetHandoffTargetsCache();
    const { client, counts } = makeClient([], []);
    await loadHandoffTargets(client, "t:1", 5_000);
    await loadHandoffTargets(client, "t:2", 5_000);
    expect(counts()).toEqual({ agentCalls: 2, teamCalls: 2 });
  });
});
