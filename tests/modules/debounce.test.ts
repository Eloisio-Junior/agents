import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { MemorySaver } from "@langchain/langgraph";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import { encryptJson } from "@/api/lib/crypto";
import type { ChatwootClient } from "@/modules/chatwoot/client";
import { flushDebounceJob } from "@/modules/debounce/handler";
import {
  armDebounce,
  debounceDedupeKey,
  resolveDebounceConfig,
} from "@/modules/debounce/service";
import type { ClaimedJob } from "@/modules/scheduler/service";
import {
  claimDueDebounceJobs,
  claimDueJobs,
  enqueueJob,
} from "@/modules/scheduler/service";
import { seedChatwootInstance } from "../utils/chatwoot";

const appUrl = process.env.TEST_APP_DATABASE_URL;
const suUrl = process.env.MIGRATION_DATABASE_URL;
let dbUp = false;
let su: PrismaClient | undefined;
let app: PrismaClient | undefined;
if (appUrl && suUrl) {
  try {
    su = new PrismaClient({
      adapter: new PrismaPg({ connectionString: suUrl }),
    });
    await su.$queryRaw`SELECT 1`;
    app = new PrismaClient({
      adapter: new PrismaPg({ connectionString: appUrl }),
    });
    await app.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    dbUp = false;
  }
}
const appDb = app as PrismaClient;
const suDb = su as PrismaClient;

let tenantId = 0n;
let instanceId = 0n;
let inboxDbId = 0n;

const REPLY = "Claro, posso ajudar!";
const CHATWOOT_INBOX_ID = 7;

function fakeModel() {
  return new FakeListChatModel({ responses: [REPLY] });
}

// Stub client whose getMessages returns a queued sequence (last value repeats) and records posts.
function makeStub(opts: {
  pages: unknown[];
  sent: Array<[number, string]>;
  calls: { getMessages: number };
}) {
  let i = 0;
  const client = {
    getMessages: async () => {
      const page = opts.pages[Math.min(i, opts.pages.length - 1)] ?? {
        payload: [],
      };
      i += 1;
      opts.calls.getMessages += 1;
      return page;
    },
    sendMessage: async (conversationId: number, content: string) => {
      opts.sent.push([conversationId, content]);
      return {};
    },
  } as unknown as ChatwootClient;
  return async () => client;
}

function page(
  msgs: Array<{ id: number; content: string; type?: number; priv?: boolean }>,
) {
  return {
    payload: msgs.map((m) => ({
      id: m.id,
      content: m.content,
      message_type: m.type ?? 0,
      private: m.priv ?? false,
    })),
  };
}

function threadOf(convId: number) {
  return `${tenantId}:${instanceId}:${convId}`;
}

async function seedConversation(
  convId: number,
  over: {
    assigneeType?: string | null;
    lastHandledMessageId?: number | null;
  } = {},
) {
  await suDb.conversation.create({
    data: {
      tenantId,
      chatwootInstanceId: instanceId,
      chatwootConversationId: convId,
      status: "pending",
      assigneeType: over.assigneeType ?? null,
      inboxId: inboxDbId,
      threadId: threadOf(convId),
      lastEventAt: new Date(),
      lastHandledMessageId: over.lastHandledMessageId ?? null,
    },
  });
}

function jobFor(convId: number): ClaimedJob {
  return {
    id: 1n,
    tenantId,
    kind: "DEBOUNCE",
    payload: { threadId: threadOf(convId), agentBotId: 9, burstStartedAt: 1 },
    attempts: 0,
  };
}

async function watermarkOf(convId: number): Promise<number | null> {
  const row = await suDb.conversation.findFirstOrThrow({
    where: { tenantId, chatwootConversationId: convId },
    select: { lastHandledMessageId: true },
  });
  return row.lastHandledMessageId;
}

describe.skipIf(!dbUp)("debounce", () => {
  beforeAll(async () => {
    const t = await suDb.tenant.create({
      data: { name: "DBC", slug: `dbc-${process.pid}` },
    });
    tenantId = t.id;
    const inst = await seedChatwootInstance(suDb, {
      tenantId,
      accountId: 9,
      baseUrl: "https://chat.example.com",
      adminToken: encryptJson("ADMIN"),
    });
    instanceId = inst.id;
    const llmKey = await suDb.vaultEntry.create({
      data: { tenantId, name: "llm-key", secret: encryptJson("sk-test") },
      select: { id: true },
    });
    const agent = await suDb.agent.create({
      data: {
        tenantId,
        name: "Atendente",
        systemPrompt: "Você é prestativa.",
        modelConfig: {
          provider: "openai",
          model: "gpt-4o-mini",
          credentialRef: `vault:${llmKey.id}`,
        },
        // Pin split off so the flush asserts a single coalesced send (split is on
        // by default now and has its own test).
        settings: {
          debounce: { enabled: true, windowSeconds: 15 },
          split: { enabled: false },
        },
      },
    });
    await suDb.chatwootAgentBot.create({
      data: {
        tenantId,
        chatwootInstanceId: instanceId,
        agentId: agent.id,
        chatwootAgentBotId: 9,
        accessToken: encryptJson("BOT"),
        webhookSecret: encryptJson("S"),
        webhookRouteTokenHash: `db-route-${process.pid}`,
        name: "Atendente",
      },
    });
    const inbox = await suDb.inbox.create({
      data: {
        tenantId,
        chatwootInstanceId: instanceId,
        chatwootInboxId: CHATWOOT_INBOX_ID,
        name: "Suporte",
        agentId: agent.id,
      },
    });
    inboxDbId = inbox.id;
  });

  afterAll(async () => {
    if (tenantId) {
      for (const table of [
        "scheduler_jobs",
        "llm_usage",
        "conversations",
        "inboxes",
        "agents",
        "vault_entries",
        "chatwoot_instances",
      ]) {
        await suDb.$executeRawUnsafe(
          `DELETE FROM ${table} WHERE tenant_id = ${tenantId}`,
        );
      }
      await suDb.$executeRawUnsafe(
        `DELETE FROM tenants WHERE id = ${tenantId}`,
      );
    }
    await suDb.$disconnect();
    await appDb.$disconnect();
  });

  test("resolveDebounceConfig returns the agent's config (enabled)", async () => {
    const cfg = await resolveDebounceConfig(
      tenantId,
      instanceId,
      CHATWOOT_INBOX_ID,
      appDb,
    );
    expect(cfg?.enabled).toBe(true);
    expect(cfg?.windowSeconds).toBe(15);
  });

  test("resolveDebounceConfig returns null for an unbound inbox", async () => {
    const cfg = await resolveDebounceConfig(tenantId, instanceId, 999, appDb);
    expect(cfg).toBeNull();
  });

  test("the scheduler claim excludes DEBOUNCE; the debounce claim takes only it", async () => {
    await suDb.$executeRawUnsafe(
      `DELETE FROM scheduler_jobs WHERE tenant_id = ${tenantId}`,
    );
    const past = new Date(Date.now() - 60_000);
    await enqueueJob({
      tenantId,
      kind: "WEBHOOK_RETRY",
      dedupeKey: "dbc-wr",
      runAt: past,
      base: appDb,
    });
    await armDebounce({
      tenantId,
      threadId: threadOf(700),
      agentBotId: 9,
      cfg: {
        enabled: true,
        windowSeconds: 15,
        maxMessagesPerBurst: 20,
        maxWindowSeconds: 60,
      },
      base: appDb,
      now: past,
    });

    const scheduled = (await claimDueJobs(50, appDb)).filter(
      (j) => j.tenantId === tenantId,
    );
    expect(scheduled.some((j) => j.kind === "WEBHOOK_RETRY")).toBe(true);
    expect(scheduled.some((j) => j.kind === "DEBOUNCE")).toBe(false);

    const debounced = (await claimDueDebounceJobs(50, appDb)).filter(
      (j) => j.tenantId === tenantId,
    );
    expect(debounced.every((j) => j.kind === "DEBOUNCE")).toBe(true);
    expect(debounced.some((j) => j.payload.threadId === threadOf(700))).toBe(
      true,
    );
  });

  test("armDebounce re-arms one row, keeps burst start, and caps at maxWindow", async () => {
    await suDb.$executeRawUnsafe(
      `DELETE FROM scheduler_jobs WHERE tenant_id = ${tenantId}`,
    );
    const thread = threadOf(701);
    const cfg = {
      enabled: true,
      windowSeconds: 15,
      maxMessagesPerBurst: 20,
      maxWindowSeconds: 20,
    };
    const t0 = new Date(Date.now() - 5_000);
    await armDebounce({
      tenantId,
      threadId: thread,
      agentBotId: 9,
      cfg,
      base: appDb,
      now: t0,
    });
    const row1 = await suDb.schedulerJob.findFirstOrThrow({
      where: {
        tenantId,
        kind: "DEBOUNCE",
        dedupeKey: debounceDedupeKey(thread),
      },
      select: { id: true, runAt: true, payload: true },
    });
    expect(row1.runAt.getTime()).toBe(t0.getTime() + 15_000);

    // 18s into the burst: window would push to +33s, but maxWindow caps it at +20s; one row, same id.
    const t1 = new Date(t0.getTime() + 18_000);
    await armDebounce({
      tenantId,
      threadId: thread,
      agentBotId: 9,
      cfg,
      base: appDb,
      now: t1,
    });
    const rows = await suDb.schedulerJob.findMany({
      where: {
        tenantId,
        kind: "DEBOUNCE",
        dedupeKey: debounceDedupeKey(thread),
      },
      select: { id: true, runAt: true, payload: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(row1.id);
    expect(rows[0]?.runAt.getTime()).toBe(t0.getTime() + 20_000);
    expect(
      (rows[0]?.payload as { burstStartedAt: number } | undefined)
        ?.burstStartedAt,
    ).toBe(t0.getTime());
  });

  test("flush coalesces the burst into one reply and advances the watermark", async () => {
    await seedConversation(800);
    const sent: Array<[number, string]> = [];
    const calls = { getMessages: 0 };
    const out = await flushDebounceJob({
      job: jobFor(800),
      base: appDb,
      deps: {
        makeModel: fakeModel,
        makeClient: makeStub({
          pages: [
            page([
              { id: 1, content: "oi" },
              { id: 2, content: "tudo bem?" },
            ]),
          ],
          sent,
          calls,
        }),
        checkpointer: new MemorySaver(),
      },
    });
    expect(out).toEqual({ outcome: "done" });
    expect(sent).toEqual([[800, REPLY]]);
    expect(await watermarkOf(800)).toBe(2);
  });

  test("a re-flush with nothing past the watermark posts nothing (idempotent)", async () => {
    // conv 800 watermark is now 2; the same page yields no pending messages.
    const sent: Array<[number, string]> = [];
    const calls = { getMessages: 0 };
    const out = await flushDebounceJob({
      job: jobFor(800),
      base: appDb,
      deps: {
        makeModel: fakeModel,
        makeClient: makeStub({
          pages: [
            page([
              { id: 1, content: "oi" },
              { id: 2, content: "tudo bem?" },
            ]),
          ],
          sent,
          calls,
        }),
        checkpointer: new MemorySaver(),
      },
    });
    expect(out).toEqual({ outcome: "done" });
    expect(sent).toEqual([]);
    expect(await watermarkOf(800)).toBe(2);
  });

  test("a message arriving mid-turn supersedes the reply (no post, watermark untouched)", async () => {
    await seedConversation(801);
    const sent: Array<[number, string]> = [];
    const calls = { getMessages: 0 };
    const out = await flushDebounceJob({
      job: jobFor(801),
      base: appDb,
      deps: {
        makeModel: fakeModel,
        makeClient: makeStub({
          // first fetch (burst) → ids 1,2; second fetch (shouldPost) → a newer id 3 arrived.
          pages: [
            page([
              { id: 1, content: "oi" },
              { id: 2, content: "?" },
            ]),
            page([
              { id: 1, content: "oi" },
              { id: 2, content: "?" },
              { id: 3, content: "ainda aí?" },
            ]),
          ],
          sent,
          calls,
        }),
        checkpointer: new MemorySaver(),
      },
    });
    expect(out).toEqual({ outcome: "done" });
    expect(sent).toEqual([]);
    expect(await watermarkOf(801)).toBeNull();
  });

  test("a human assignee closes the gate before any Chatwoot fetch", async () => {
    await seedConversation(802, { assigneeType: "User" });
    const sent: Array<[number, string]> = [];
    const calls = { getMessages: 0 };
    const out = await flushDebounceJob({
      job: jobFor(802),
      base: appDb,
      deps: {
        makeModel: fakeModel,
        makeClient: makeStub({
          pages: [page([{ id: 1, content: "oi" }])],
          sent,
          calls,
        }),
        checkpointer: new MemorySaver(),
      },
    });
    expect(out).toEqual({ outcome: "done" });
    expect(sent).toEqual([]);
    expect(calls.getMessages).toBe(0);
  });
});
