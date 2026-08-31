import type { Prisma, PrismaClient } from "@/../generated/prisma/client";
import { parseThreadId } from "@/graph/nudge";
import { runScopedOn, type TenantContext } from "@/lib/tenancy";
import { markGoogleCalendarAppointmentPaid } from "@/modules/integrations/toolpacks/google-calendar";
import type { IntegrationSelection } from "@/modules/integrations/toolpacks/types";
import { registerJobHandler } from "@/modules/scheduler/worker";
import { resolveInjectableCredential } from "@/modules/vault/injectable";

function sysCtx(tenantId: bigint): TenantContext {
  return { tenantId, userId: null, role: "TENANT_ADMIN" };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function paymentAppointmentHandler(
  job: {
    tenantId: bigint;
    payload: Record<string, unknown>;
  },
  base: PrismaClient,
) {
  const threadId = text(job.payload.threadId);
  const eventId = text(job.payload.eventId);
  const calendarId = text(job.payload.calendarId);
  const paymentId = text(job.payload.paymentId);
  const refIdRaw = text(job.payload.refId);
  if (!threadId || !eventId || !calendarId || !paymentId || !refIdRaw) {
    return {
      outcome: "fail" as const,
      error: "invalid payment appointment payload",
    };
  }
  const refId = BigInt(refIdRaw);
  const parsed = parseThreadId(threadId);
  if (!parsed || parsed.tenantId !== job.tenantId) {
    return {
      outcome: "fail" as const,
      error: "payment appointment thread mismatch",
    };
  }
  const loaded = await runScopedOn(base, sysCtx(job.tenantId), async (db) => {
    const appointment = await db.appointment.findFirst({
      where: {
        threadId,
        provider: "google_calendar",
        externalId: eventId,
        calendarId,
        cancelledAt: null,
        startAt: { gt: new Date() },
      },
      select: { id: true },
    });
    const ref = await db.integrationExternalRef.findUnique({
      where: { id: refId },
      select: { threadId: true, metadata: true },
    });
    const conversation = await db.conversation.findUnique({
      where: {
        tenantId_chatwootInstanceId_chatwootConversationId: {
          tenantId: job.tenantId,
          chatwootInstanceId: parsed.instanceId,
          chatwootConversationId: parsed.conversationId,
        },
      },
      select: { contactId: true },
    });
    const integrations = await db.integrationInstance.findMany({
      where: { catalogType: "GOOGLE_CALENDAR", enabled: true },
      select: { id: true, config: true, credentialRef: true },
    });
    const matching = integrations.filter((integration) => {
      const config = (integration.config ?? {}) as Record<string, unknown>;
      return (
        Array.isArray(config.calendarIds) &&
        config.calendarIds.includes(calendarId)
      );
    });
    return { appointment, ref, conversation, matching };
  });
  if (!loaded.appointment || loaded.ref?.threadId !== threadId) {
    return { outcome: "done" as const };
  }
  const metadata = (loaded.ref.metadata ?? {}) as Record<string, unknown>;
  if (metadata.paymentId !== paymentId || loaded.matching.length !== 1) {
    return { outcome: "done" as const };
  }
  const integration = loaded.matching[0];
  if (!integration || loaded.conversation?.contactId == null) {
    return {
      outcome: "fail" as const,
      error: "calendar integration unavailable",
    };
  }
  const selection: IntegrationSelection = {
    instanceId: integration.id,
    catalogType: "GOOGLE_CALENDAR",
    config: (integration.config ?? {}) as Record<string, unknown>,
    credentialRef: integration.credentialRef,
    enabledTools: [],
  };
  const result = await markGoogleCalendarAppointmentPaid(
    selection,
    {
      tenantId: job.tenantId,
      base,
      threadId,
      contactDbId: loaded.conversation.contactId,
      resolveCredential: (ref) =>
        resolveInjectableCredential(base, job.tenantId, ref),
    },
    { eventId, calendarId },
  );
  if (!result.ok) return { outcome: "fail" as const, error: result.error };
  await runScopedOn(base, sysCtx(job.tenantId), (db) =>
    db.integrationExternalRef.update({
      where: { id: refId },
      data: {
        metadata: {
          ...metadata,
          paidAppointmentEventId: eventId,
          paidAppointmentAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    }),
  );
  return { outcome: "done" as const };
}

let registered = false;
export function registerPaymentAppointmentHandler(): void {
  if (registered) return;
  registerJobHandler("PAYMENT_APPOINTMENT", paymentAppointmentHandler);
  registered = true;
}
