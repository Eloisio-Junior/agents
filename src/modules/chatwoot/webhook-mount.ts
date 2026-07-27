// Single source of truth for the dedicated Chatwoot Agent Bot webhook path. The controller
// mounts here and the Agent Bot's outgoing_url is derived from the SAME constant at
// provisioning time, so the two can never drift (a 404 outgoing_url makes Chatwoot
// auto-escalate pending→open). The per-instance opaque routeToken is the last path segment;
// it resolves tenant+instance in constant time on receipt.
//
// NOTE: keep in sync with the chatwootController prefix/route in src/api/v1/chatwoot.controller.ts
// (`/api` group + `/v1/chatwoot` prefix + `/webhook/:routeToken`). A unit test asserts equality.
export const CHATWOOT_WEBHOOK_MOUNT = "/api/v1/chatwoot/webhook";

export function chatwootOutgoingUrl(
  publicUrl: string,
  routeToken: string,
): string {
  return `${publicUrl.replace(/\/+$/, "")}${CHATWOOT_WEBHOOK_MOUNT}/${routeToken}`;
}
