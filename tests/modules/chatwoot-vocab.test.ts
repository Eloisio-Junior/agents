import { afterEach, describe, expect, test } from "bun:test";
import type { ChatwootClient } from "@/modules/chatwoot/client";
import {
  __resetChatwootVocabCache,
  attributesForModel,
  loadChatwootVocab,
} from "@/modules/chatwoot/vocab";

afterEach(() => __resetChatwootVocabCache());

function fakeClient(counter: { labels: number; defs: number }): ChatwootClient {
  return {
    listLabels: async () => {
      counter.labels++;
      return ["lead", "vip"];
    },
    listCustomAttributeDefinitions: async () => {
      counter.defs++;
      return [
        {
          key: "lead_stage",
          displayName: "Lead stage",
          model: "conversation_attribute",
          displayType: "list",
          values: ["new", "qualified"],
        },
        {
          key: "plano",
          displayName: "Plano",
          model: "contact_attribute",
          displayType: "list",
          values: ["Free", "Pro"],
        },
      ];
    },
  } as unknown as ChatwootClient;
}

describe("loadChatwootVocab", () => {
  test("fetches labels + attribute definitions and caches per key (TTL)", async () => {
    const counter = { labels: 0, defs: 0 };
    const client = fakeClient(counter);
    const a = await loadChatwootVocab(client, "1:2", 1_000);
    expect(a.labels).toEqual(["lead", "vip"]);
    expect(a.attributes).toHaveLength(2);
    // Within the TTL window → served from cache (no second fetch).
    await loadChatwootVocab(client, "1:2", 1_000 + 30_000);
    expect(counter.labels).toBe(1);
    expect(counter.defs).toBe(1);
    // Past the TTL → refetch.
    await loadChatwootVocab(client, "1:2", 1_000 + 120_000);
    expect(counter.labels).toBe(2);
  });

  test("attributesForModel filters by attribute_model", () => {
    const vocab = {
      labels: [],
      attributes: [
        {
          key: "a",
          displayName: "A",
          model: "conversation_attribute",
          displayType: "text",
          values: [],
        },
        {
          key: "b",
          displayName: "B",
          model: "contact_attribute",
          displayType: "text",
          values: [],
        },
      ],
    };
    expect(
      attributesForModel(vocab, "contact_attribute").map((d) => d.key),
    ).toEqual(["b"]);
    expect(attributesForModel(undefined, "contact_attribute")).toEqual([]);
  });
});
