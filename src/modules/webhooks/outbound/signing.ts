import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC signature for our outbound webhooks. Scheme mirrors Chatwoot's inbound format for
// consistency: signature = "sha256=" + HMAC_SHA256(secret, `${timestamp}.${rawBody}`) in
// hex, with the unix-seconds timestamp sent alongside. Receivers verify the timestamp
// window (anti-replay) and recompute over the raw body.

export const SIGNATURE_HEADER = "x-secretaria-signature";
export const TIMESTAMP_HEADER = "x-secretaria-timestamp";
export const DELIVERY_HEADER = "x-secretaria-delivery";

export function signOutbound(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `sha256=${mac}`;
}

export function verifyOutboundSignature(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
  signature: string,
): boolean {
  const expected = signOutbound(secret, timestampSeconds, rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
