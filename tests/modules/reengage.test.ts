import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { MemorySaver } from "@langchain/langgraph";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import { encryptJson } from "@/api/lib/crypto";
import type { TenantContext } from "@/lib/tenancy";
import type { ChatwootClient } from "@/modules/chatwoot/client";
import { reengageConversation } from "@/modules/conversations/reengage";
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

const REPLY = "Desculpe a demora, já te ajudo!";
const fakeModel = () => new FakeListChatModel({ responses: [REPLY] });

function ctx(): TenantContext {
  return { tenantId, userId: null, role: "TENANT_ADMIN" };
}

function makeStub(opts: { page: unknown; sent: Array<[number, string]> }) {
  const client = {
    getMessages: async () => opts.page,
    sendMessage: async (conversationId: number, content: string) => {
      opts.sent.push([conversationId, content]);
      return {};
    },
    toggleTyping: async () => ({}),
  } as unknown as ChatwootClient;
  return async () => client;
}

function page(msgs: Array<{ id: number; content: string; type?: number }>) {
  return {
    payload: msgs.map((m) => ({
      id: m.id,
      content: m.content,
      message_type: m.type ?? 0,
      private: false,
    })),
  };
}

async function seedConversation(
  convId: number,
  over: { assigneeType?: string | null; lastError?: string | null } = {},
): Promise<bigint> {
  const c = await suDb.conversation.create({
    data: {
      tenantId,
      chatwootInstanceId: instanceId,
      chatwootConversationId: convId,
      status: "pending",
      assigneeType: over.assigneeType ?? null,
      inboxId: inboxDbId,
      threadId: `${tenantId}:${instanceId}:${convId}`,
      lastEventAt: new Date(),
      lastError: over.lastError ?? null,
      lastErrorAt: over.lastError ? new Date() : null,
    },
  });
  return c.id;
}

describe.skipIf(!dbUp)("reengage", () => {
  beforeAll(async () => {
    const t = await suDb.tenant.create({
      data: { name: "RE", slug: `re-${process.pid}` },
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
        webhookRouteTokenHash: `re-route-${process.pid}`,
        name: "Atendente",
      },
    });
    const inbox = await suDb.inbox.create({
      data: {
        tenantId,
        chatwootInstanceId: instanceId,
        chatwootInboxId: 7,
        name: "Suporte",
        agentId: agent.id,
      },
    });
    inboxDbId = inbox.id;
  });

  afterAll(async () => {
    if (tenantId) {
      for (const table of [
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

  test("re-fires the unanswered tail (incoming after last outgoing) and clears lastError", async () => {
    const id = await seedConversation(900, { lastError: "boom: timeout" });
    const sent: Array<[number, string]> = [];
    const res = await reengageConversation(
      ctx(),
      id,
      {
        makeModel: fakeModel,
        makeClient: makeStub({
          page: page([
            { id: 1, content: "oi", type: 0 },
            { id: 2, content: "resposta antiga", type: 1 }, // outgoing
            { id: 3, content: "e aí, esqueceu de mim?", type: 0 }, // unanswered
          ]),
          sent,
        }),
        checkpointer: new MemorySaver(),
      },
      appDb,
    );

    expect(res.outcome).toBe("posted");
    expect(sent).toEqual([[900, REPLY]]);
    const row = await suDb.conversation.findFirstOrThrow({
      where: { tenantId, chatwootConversationId: 900 },
      select: { lastError: true, lastErrorAt: true },
    });
    expect(row.lastError).toBeNull();
    expect(row.lastErrorAt).toBeNull();
  });

  test("a human assignee closes the gate (no fetch, no post)", async () => {
    const id = await seedConversation(901, { assigneeType: "User" });
    const sent: Array<[number, string]> = [];
    const res = await reengageConversation(
      ctx(),
      id,
      {
        makeModel: fakeModel,
        makeClient: makeStub({ page: page([{ id: 1, content: "oi" }]), sent }),
        checkpointer: new MemorySaver(),
      },
      appDb,
    );
    expect(res.outcome).toBe("gate-closed");
    expect(sent).toEqual([]);
  });

  test("nothing unanswered → empty (no post)", async () => {
    const id = await seedConversation(902);
    const sent: Array<[number, string]> = [];
    const res = await reengageConversation(
      ctx(),
      id,
      {
        makeModel: fakeModel,
        makeClient: makeStub({
          page: page([
            { id: 1, content: "oi", type: 0 },
            { id: 2, content: "já respondi", type: 1 }, // last message is outgoing
          ]),
          sent,
        }),
        checkpointer: new MemorySaver(),
      },
      appDb,
    );
    expect(res.outcome).toBe("empty");
    expect(sent).toEqual([]);
  });
});
