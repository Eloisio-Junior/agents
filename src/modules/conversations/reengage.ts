import type { PrismaClient } from "@/../generated/prisma/client";
import basePrisma from "@/api/lib/prisma";
import { loadAgentConfig } from "@/graph/prepare";
import type { RunAgentTurnOutcome, RuntimeDeps } from "@/graph/runtime";
import { AppError, NotFoundError } from "@/lib/errors";
import { runScopedOn, type TenantContext } from "@/lib/tenancy";
import {
  type ChatwootMessageRow,
  pendingIncoming,
} from "@/modules/chatwoot/messages";
import { shouldBotHandle } from "@/modules/chatwoot/normalize";
import { coalesceAndRunTurn } from "@/modules/debounce/handler";
import { clearConversationError } from "./error";

// Manual re-engage (item 6): re-fire the agent turn on a conversation WITHOUT waiting for a new
// customer message — the recovery path after a failed turn. It answers the unanswered tail (every
// incoming message after the last outgoing one), reusing the debounce flush's coalesce machinery
// (watermark CAS = at-most-once, so a double click or a racing flush posts at most once). Honors the
// assignee gate: if a human owns the conversation it does nothing (the operator should "return to
// agent" first). Clears the conversation's lastError on a successful post.

function sysCtx(tenantId: bigint): TenantContext {
  return { tenantId, userId: null, role: "TENANT_ADMIN" };
}

function requireTenant(ctx: TenantContext): bigint {
  if (ctx.tenantId === null) {
    throw new AppError("tenant required", 400, "errors.tenantTargetRequired");
  }
  return ctx.tenantId;
}

// The unanswered tail: incoming customer messages after the last outgoing/template message (what the
// customer said that we have not replied to). No outgoing yet ⇒ the whole page (first turn failed).
function incomingAfterLastOutgoing(
  messages: ChatwootMessageRow[],
): ChatwootMessageRow[] {
  let lastOut = 0;
  for (const m of messages) {
    if (
      (m.messageType === "outgoing" || m.messageType === "template") &&
      m.id > lastOut
    ) {
      lastOut = m.id;
    }
  }
  return pendingIncoming(messages, lastOut > 0 ? lastOut : null);
}

export type ReengageOutcome = RunAgentTurnOutcome | "empty" | "gate-closed";

export interface ReengageResult {
  outcome: ReengageOutcome;
}

export async function reengageConversation(
  ctx: TenantContext,
  conversationDbId: bigint,
  deps: RuntimeDeps = {},
  base: PrismaClient = basePrisma,
): Promise<ReengageResult> {
  const tenantId = requireTenant(ctx);

  // Scoped read: resolve the conversation + its inbox's agent config (DB only; network is the turn).
  const resolved = await runScopedOn(base, sysCtx(tenantId), async (db) => {
    const conv = await db.conversation.findUnique({
      where: { id: conversationDbId },
      select: {
        id: true,
        chatwootInstanceId: true,
        chatwootConversationId: true,
        threadId: true,
        status: true,
        assigneeType: true,
        inboxId: true,
      },
    });
    if (!conv) return "not-found" as const;
    if (!conv.inboxId) return "no-agent" as const;
    const inbox = await db.inbox.findUnique({
      where: { id: conv.inboxId },
      select: { agentId: true },
    });
    if (!inbox?.agentId) return "no-agent" as const;
    const agentRow = await db.agent.findUnique({
      where: { id: inbox.agentId },
      select: { settings: true },
    });
    const loaded = await loadAgentConfig(db, {
      tenantId,
      instanceId: conv.chatwootInstanceId,
      conversationId: conv.chatwootConversationId,
      agentId: inbox.agentId,
      threadId: conv.threadId,
    });
    if (!loaded) return "no-agent" as const;
    return {
      convDbId: conv.id,
      instanceId: conv.chatwootInstanceId,
      conversationId: conv.chatwootConversationId,
      threadId: conv.threadId,
      status: conv.status,
      assigneeType: conv.assigneeType,
      loaded,
      settings: agentRow?.settings ?? {},
    };
  });

  if (resolved === "not-found") {
    throw new NotFoundError(
      "conversation not found",
      "errors.conversationNotFound",
    );
  }
  if (resolved === "no-agent") {
    throw new AppError(
      "no agent is bound to this conversation's inbox",
      400,
      "errors.reengageNoAgent",
    );
  }

  // Assignee gate: never re-fire over a conversation a human owns (they should "return to agent"
  // first). runLoadedTurn re-checks before posting too, but gating early avoids a wasted LLM call.
  const gateOpen = shouldBotHandle(
    { assigneeType: resolved.assigneeType, status: resolved.status },
    { ourAgentBotId: resolved.loaded.agentBotId },
  );
  if (!gateOpen) return { outcome: "gate-closed" };

  const outcome = await coalesceAndRunTurn(
    {
      tenantId,
      instanceId: resolved.instanceId,
      conversationId: resolved.conversationId,
      threadId: resolved.threadId,
      agentBotId: resolved.loaded.agentBotId,
      convDbId: resolved.convDbId,
      loaded: resolved.loaded,
      settings: resolved.settings,
      selectPending: incomingAfterLastOutgoing,
      label: "reengage",
    },
    base,
    deps,
  );

  if (outcome === "posted") {
    await clearConversationError({
      tenantId,
      instanceId: resolved.instanceId,
      chatwootConversationId: resolved.conversationId,
      base,
    });
  }
  return { outcome };
}
