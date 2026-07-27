import { Elysia, t } from "elysia";
import logger from "@/api/lib/logger";
import { doc } from "@/api/lib/openapi";
import {
  processInboundDelivery,
  receiveInbound,
} from "@/modules/webhooks/inbound/service";

// Public, JWT-less inbound receptor for integrations (the n8n-style webhook node). It is NOT
// behind tenancyPlugin/requireAuth: the opaque routeToken resolves the tenant and the
// per-instance auth strategy authenticates the call. Mounted under /api → the path is
// /api/v1/integrations/inbound/:routeToken. POST only, so the GET 404 guards and the SPA
// catch-all never apply.
export const integrationsController = new Elysia({
  prefix: "/v1/integrations",
  tags: ["Integrations"],
}).post(
  "/inbound/:routeToken",
  async ({ params, request }) => {
    // NOTE: read the RAW body (HMAC strategies sign the exact bytes; re-serializing the parsed
    // JSON would not match). We never declare/access `body`, so Elysia does not pre-parse it.
    const rawBody = await request.text();
    const result = await receiveInbound({
      routeToken: params.routeToken,
      rawBody,
      getHeader: (name) => request.headers.get(name),
    });

    // Ack fast (<5s, e.g. Chatwoot auto-escalates pending→open on a slow/non-2xx ack); the
    // dispatch runs detached. processInboundDelivery is idempotent (status CAS) and reclaims a
    // PROCESSING row stranded by a crash once it is stale, so re-firing on a duplicate POST is safe.
    if (
      result.deliveryId !== undefined &&
      result.tenantId !== undefined &&
      (result.outcome === "queued" || result.outcome === "duplicate")
    ) {
      const { deliveryId, tenantId } = result;
      void processInboundDelivery({ deliveryId, tenantId }).catch((err) => {
        logger.error(
          "inbound async dispatch failed (delivery %s): %s",
          String(deliveryId),
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    return { ack: true, outcome: result.outcome };
  },
  {
    detail: {
      ...doc(
        "Generic inbound webhook",
        "Public inbound receptor for integrations (n8n-style webhook node); authenticated by the opaque per-instance route token plus the per-instance auth strategy (e.g. HMAC or static header, verified in-handler after tenant resolution), not by a session cookie or bearer. Acks fast and always returns 200 to avoid leaking auth state.",
      ),
      security: [],
    },
    params: t.Object({
      routeToken: t.String({
        description:
          "Opaque per-instance route token (not a BigInt id) that resolves the tenant and integration instance and selects its inbound auth strategy.",
      }),
    }),
  },
);
