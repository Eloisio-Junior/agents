// Shared (server + client) branding allowlist + color-token validation. SINGLE source of truth so
// the server's write-time validation and the client's apply-time mapping never drift. The server
// sanitizes on write (never trust the client); the client maps these keys to CSS vars on apply.
// Pure module (no DOM, no node deps) so it is safe to import from both sides.

export const BRANDABLE_KEYS = [
  "accent",
  "accentHover",
  "accentForeground",
  "accentMuted",
  "accentSoft",
  "primary",
] as const;
export type BrandableKey = (typeof BRANDABLE_KEYS)[number];

// Brand-accent colors only — never structural bg/text (overriding those could destroy contrast).
export const BRANDABLE_KEY_TO_VAR: Record<BrandableKey, string> = {
  accent: "--color-accent",
  accentHover: "--color-accent-hover",
  accentForeground: "--color-accent-foreground",
  accentMuted: "--color-accent-muted",
  accentSoft: "--color-accent-soft",
  primary: "--color-primary",
};

// A single color token: hex, or rgb(a)/hsl(a)/oklch/oklab/lab/lch functional forms. No url(), no
// semicolons/braces/comments, no expressions — the inner chars are a restricted safe set.
const COLOR_TOKEN =
  /^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([0-9a-zA-Z.%,/\s-]+\))$/;

export function isValidColorToken(value: unknown): value is string {
  return typeof value === "string" && COLOR_TOKEN.test(value.trim());
}

const BRANDABLE_SET = new Set<string>(BRANDABLE_KEYS);

// The allowlisted, validated branding (short-key → trimmed color). Unknown keys and invalid
// values are dropped. The server stores exactly this; the client derives CSS vars from it.
export function sanitizeBranding(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (BRANDABLE_SET.has(k) && isValidColorToken(v)) {
      out[k] = (v as string).trim();
    }
  }
  return out;
}
