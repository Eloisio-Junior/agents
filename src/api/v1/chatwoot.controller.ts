import { Elysia, t } from "elysia";
import logger from "@/api/lib/logger";
import { doc } from "@/api/lib/openapi";
import {
  processChatwootDelivery,
  receiveChatwootWebhook,
} from "@/modules/chatwoot/webhook";

// Public, JWT-less Chatwoot Agent Bot webhook receiver. Not behind tenancyPlugin/requireAuth:
// the opaque routeToken resolves the tenant and the per-instance HMAC secret authenticates the
// call. Mounted under /api → the effective path is /api/v1/chatwoot/webhook/:routeToken, which
// MUST equal CHATWOOT_WEBHOOK_MOUNT (asserted in tests). POST only, so the GET 404 guards and
// the SPA catch-all never apply.
export const chatwootController = new Elysia({
  prefix: "/v1/chatwoot",
  tags: ["Channels"],
}).post(
  "/webhook/:routeToken",
  async ({ params, request }) => {
    // NOTE: read the RAW body — the HMAC signs the exact bytes Chatwoot sent; re-serializing the
    // parsed JSON would not match. We never declare/access `body`, so Elysia does not pre-parse.
    const rawBody = await request.text();
    const result = await receiveChatwootWebhook({
      routeToken: params.routeToken,
      rawBody,
      getHeader: (name) => request.headers.get(name),
    });

    // Ack fast (<5s): a slow or non-2xx ack makes Chatwoot move the conversation pending→open
    // (auto-escalate to a human). The dispatch runs detached; processChatwootDelivery is
    // idempotent (status CAS), so re-firing on a duplicate that found a stranded PENDING is safe.
    if (
      result.outcome === "queued" &&
      result.tenantId !== undefined &&
      result.instanceId !== undefined &&
      result.deliveryRowId !== undefined &&
      result.normalized !== undefined
    ) {
      const {
        tenantId,
        instanceId,
        deliveryRowId,
        agentBotId = null,
        normalized,
      } = result;
      void processChatwootDelivery({
        tenantId,
        instanceId,
        deliveryRowId,
        agentBotId,
        normalized,
      }).catch((err) => {
        logger.error(
          "chatwoot async dispatch failed (delivery %s): %s",
          String(deliveryRowId),
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    return { ack: true, outcome: result.outcome };
  },
  {
    detail: {
      ...doc(
        "Chatwoot bot webhook",
        "Public Agent Bot webhook receiver; authenticated by the opaque per-instance route token plus the HMAC signature header (verified in-handler after tenant resolution), not by a session cookie or bearer. Acks fast and always returns 200 to avoid leaking auth state.",
      ),
      security: [],
    },
    params: t.Object({
      routeToken: t.String({
        description:
          "Opaque per-instance route token (not a BigInt id) that resolves the tenant and instance and binds the HMAC secret.",
      }),
    }),
  },
);
