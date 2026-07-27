// The per-lead redirect link points DIRECTLY at the customer's page where the Chatwoot widget is
// embedded (the inbox's website_url), carrying only a short single-use token in the URL FRAGMENT. The
// token was minted server-side (Chatwoot Redis, TTL) and expands, on the widget side, to the lead
// identity + the cloned message. Nothing else rides in the URL: no identity, no PII, no hmac — so the
// link stays short and leaks nothing if forwarded, logged, or captured by third-party analytics.
//
// The fragment (#…) rather than the query (?…) keeps even the opaque token out of the customer's server
// logs and the Referer header. The patched Chatwoot SDK reads window.location.hash.

export interface WidgetLink {
  // The customer's page where the widget is embedded (Channel::WebWidget website_url). Absolute URL.
  websiteUrl: string;
  // The single-use redirect token (Chatwoot mintRedirectToken).
  token: string;
  // Open the widget automatically on land (cw_open=1).
  open?: boolean;
}

export interface NormalizedWebsiteUrl {
  // The repaired, absolute http(s) URL.
  url: string;
  // True when the raw value had to be repaired (e.g. a scheme-less "example.com" got https:// added).
  recovered: boolean;
}

// Normalize a Chatwoot inbox website_url into an absolute http(s) URL. A scheme-less value like
// "example.com/chat" is recovered by prepending https:// (recovered=true). Returns null when the
// value is empty or cannot become a valid http(s) URL — the caller surfaces that instead of failing
// silently. SINGLE SOURCE OF TRUTH: both the runtime link builder and the console health check use
// this, so the operator-facing verdict matches actual redirect behavior.
export function normalizeWebsiteUrl(
  raw: string | null | undefined,
): NormalizedWebsiteUrl | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return { url: url.toString(), recovered: !hasScheme };
}

export type WidgetHealthStatus =
  | "ok"
  | "recovered"
  | "invalid"
  | "missing"
  | "unknown";

export interface WidgetHealth {
  // The website_url observed on the Chatwoot web-widget inbox (raw), or null when unset/unverifiable.
  websiteUrl: string | null;
  // ok = valid absolute http(s) URL; recovered = valid only after prepending https://; invalid =
  // fetched but cannot become a valid URL; missing = fetched but no website_url set; unknown = could
  // NOT verify (Chatwoot unreachable / inbox not in the mirror) — a soft "couldn't check", NOT a
  // false "invalid", mirroring reconcileInboxBots' "unverified".
  status: WidgetHealthStatus;
}

// Pure classifier for a web-widget inbox's redirect-target health. `reachable` is false when we could
// not read the inbox from Chatwoot (fetch failed, or the inbox isn't mirrored): we then can't judge
// the URL, so "unknown" rather than a misleading "invalid". Only a SUCCESSFUL fetch can yield
// missing/invalid (the states that warrant the operator-facing fix-your-URL alert). Uses
// normalizeWebsiteUrl so the verdict matches actual redirect behavior.
export function classifyWidgetHealth(
  reachable: boolean,
  websiteUrl: string | null,
): WidgetHealth {
  if (!reachable) return { websiteUrl: null, status: "unknown" };
  if (!websiteUrl) return { websiteUrl: null, status: "missing" };
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return { websiteUrl, status: "invalid" };
  return { websiteUrl, status: normalized.recovered ? "recovered" : "ok" };
}

// Build the link to the customer's embedded page with the token (and open flag) in the URL FRAGMENT.
// Throws if websiteUrl cannot be normalized to a valid absolute URL (the caller guards + falls back
// to sending no link). A scheme-less website_url is repaired (https://) rather than rejected.
export function buildWidgetUrl(p: WidgetLink): string {
  const normalized = normalizeWebsiteUrl(p.websiteUrl);
  if (!normalized) {
    throw new Error(`channel-redirect: invalid website_url: ${p.websiteUrl}`);
  }
  const url = new URL(normalized.url);
  const frag = new URLSearchParams();
  frag.set("cw_redirect", p.token);
  if (p.open) frag.set("cw_open", "1");
  url.hash = frag.toString();
  return url.toString();
}
