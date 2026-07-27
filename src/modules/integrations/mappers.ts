import { z } from "zod";
import type { InboundMapper, NormalizedInboundEvent } from "./types";

// Registry of inbound mappers keyed by catalogType. Pure functions only. Adding a real
// integration = one entry here + its zod schema; the receptor (route-token, auth, ack/async,
// idempotency, correlation, dispatch) is untouched. Asaas is the only inbound integration
// (Calendar/Drive are outbound-only); a catalog entry without a mapper fails closed.

const REGISTRY = new Map<string, InboundMapper>();

export function registerMapper(mapper: InboundMapper): void {
  REGISTRY.set(mapper.catalogType, mapper);
}

export function getMapper(catalogType: string): InboundMapper | undefined {
  return REGISTRY.get(catalogType);
}

// ── ASAAS ──
// Brazilian payments. Webhook shape (doc-confirmed, docs.asaas.com → "Webhook para cobranças",
// 2026-06): { event: "PAYMENT_RECEIVED", payment: { id, value, status, externalReference,
// paymentLink, … } }. A received/confirmed payment is a CONVERSION; an overdue payment is an
// AGENT_NUDGE (let the agent decide on a gentle reminder). Event names PAYMENT_RECEIVED /
// PAYMENT_CONFIRMED / PAYMENT_OVERDUE are all confirmed in the docs.
//
// Correlation: the outbound toolpack (toolpacks/asaas.ts) sends an opaque correlation token as the
// payment link's `externalReference` (a doc-confirmed accepted field on POST /paymentLinks) and
// stores it as IntegrationExternalRef.externalId. We read it back here PREFERENTIALLY over
// payment.id — a link-generated payment has a different id than the link but carries the
// externalReference, the exact tie back to the conversation. payment.id is the fallback (direct
// charges) and ALWAYS drives dedupeKey (the charge is the idempotency unit; one externalReference
// may span installment charges).
//
// OPEN (needs Asaas sandbox e2e, creds-gated): confirm a link-generated payment actually ECHOES the
// link's externalReference. If it does NOT, the contingency is to correlate by `payment.paymentLink`
// (the link id, already stored on the ref as metadata.paymentLinkId) — we capture paymentLink in the
// schema/metadata below for that, but DO NOT wire it into the lookup yet (speculative until the
// sandbox capture says so).
//
// `summary` is OUR text, never the raw payload (injection boundary).
const asaasSchema = z.object({
  event: z.string().min(1),
  payment: z
    .object({
      id: z.string().min(1),
      value: z.number().finite().optional(),
      status: z.string().max(64).optional(),
      externalReference: z.string().min(1).max(128).optional(),
      // The payment link id (doc-confirmed field on link-paid payments). Captured for the
      // correlation contingency above; not currently used for the lookup.
      paymentLink: z.string().min(1).max(128).optional(),
    })
    .optional(),
});

const ASAAS_CONVERSION_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
]);

const asaasMapper: InboundMapper = {
  catalogType: "ASAAS",
  map(raw: unknown): NormalizedInboundEvent | null {
    const parsed = asaasSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.payment) return null;
    const { event, payment } = parsed.data;
    const base = {
      externalId: payment.externalReference ?? payment.id,
      dedupeKey: `${event}:${payment.id}`,
      status: payment.status,
      // Carry the link id for the correlation contingency + observability (never the raw payload).
      ...(payment.paymentLink
        ? { metadata: { paymentLink: payment.paymentLink } }
        : {}),
    };
    if (ASAAS_CONVERSION_EVENTS.has(event)) {
      return {
        ...base,
        kind: "conversion",
        value: payment.value,
        currency: "BRL",
        summary: "Payment received",
      };
    }
    if (event === "PAYMENT_OVERDUE") {
      return { ...base, kind: "agent_nudge", summary: "Payment is overdue" };
    }
    return null; // other lifecycle events are ignored
  },
};

registerMapper(asaasMapper);
