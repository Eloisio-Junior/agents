import { createHmac, timingSafeEqual } from "node:crypto";

// Verification of Chatwoot Agent Bot webhook signatures. Confirmed against the chatwoot-pro
// fork source (lib/webhooks/trigger.rb): when the bot has a secret, Chatwoot sends
//   X-Chatwoot-Delivery   = UUID (always present; our idempotency key)
//   X-Chatwoot-Timestamp  = Time.now.to_i (unix SECONDS, as string)
//   X-Chatwoot-Signature  = "sha256=" + HMAC_SHA256(secret, "{timestamp}.{rawBody}") in hex
// where rawBody is exactly @payload.to_json. We recompute over the RAW bytes (re-serializing
// the parsed JSON would not match), compare timing-safe, AND enforce a timestamp window
// (anti-replay is our responsibility, not Chatwoot's).

export const CHATWOOT_SIGNATURE_HEADER = "x-chatwoot-signature";
export const CHATWOOT_TIMESTAMP_HEADER = "x-chatwoot-timestamp";
export const CHATWOOT_DELIVERY_HEADER = "x-chatwoot-delivery";

const DEFAULT_TOLERANCE_SECONDS = 300;

function timingEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface VerifyChatwootSignatureParams {
  secret: string;
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  toleranceSeconds?: number;
  // NOTE: injectable wall clock (seconds) for tests; defaults to Date.now()/1000.
  nowSeconds?: number;
}

export function verifyChatwootSignature(
  params: VerifyChatwootSignatureParams,
): boolean {
  const { secret, rawBody, signatureHeader, timestampHeader } = params;
  if (!secret || !signatureHeader || !timestampHeader) return false;

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) return false; // stale / future → replay guard

  const expected = createHmac("sha256", secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest("hex");
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  return timingEqual(expected, provided);
}
