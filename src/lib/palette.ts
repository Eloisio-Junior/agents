import type { BrandableKey } from "@/lib/branding";

// Pure color math (no DOM): derive the full accent palette (the BRANDABLE_KEYS) from a single
// brand color, per theme. This is what makes the SIMPLE branding mode theme-safe — the contrast
// foreground flips by luminance, and the muted/soft tints move the right direction for each
// theme, instead of forcing one value across both (which breaks contrast in one of them).

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Mix a color toward white (target 255 = lighten) or black (target 0 = darken) by t in [0,1].
function mix(c: Rgb, target: 0 | 255, t: number): Rgb {
  return {
    r: c.r + (target - c.r) * t,
    g: c.g + (target - c.g) * t,
    b: c.b + (target - c.b) * t,
  };
}

// WCAG relative luminance (sRGB channels linearized).
function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// The two candidate text colors on an accent fill (matching the theme tokens), precomputed once.
const FG_DARK = "#0f0f0f";
const FG_LIGHT = "#f1f1f1";
const L_FG_DARK = relativeLuminance({ r: 15, g: 15, b: 15 });
const L_FG_LIGHT = relativeLuminance({ r: 241, g: 241, b: 241 });

// The theme backgrounds (--color-bg-primary): the accent must read as TEXT over these.
const L_BG_DARK = relativeLuminance({ r: 15, g: 15, b: 15 }); // #0f0f0f
const L_BG_LIGHT = relativeLuminance({ r: 241, g: 241, b: 241 }); // #f1f1f1

// Minimum contrast for the accent used as TEXT/icon on the theme background (links, soft-button
// labels). Above the 3:1 WCAG floor for UI/large text, with a little margin for the accent-soft
// tint (which sits slightly off the pure background). Kept below ~3.7 so a standard brand blue
// (#2563eb) is preserved on the dark theme; only colors that genuinely fail (white on a light
// theme, black on a dark one) get nudged.
const MIN_ACCENT_CONTRAST = 3.5;

// WCAG contrast ratio between two relative luminances.
function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// Pick black or white text for the HIGHER contrast against the accent fill (proper WCAG decision,
// not a single luminance threshold — a single threshold mis-picks mid-bright colors like #3ea6ff,
// where white text fails AA but black text passes AAA).
function pickForeground(c: Rgb): string {
  const l = relativeLuminance(c);
  return contrastRatio(l, L_FG_DARK) >= contrastRatio(l, L_FG_LIGHT)
    ? FG_DARK
    : FG_LIGHT;
}

// Keep the accent legible as TEXT on the theme background: darken on a light theme / lighten on a
// dark one until it clears MIN_ACCENT_CONTRAST. Colors that already clear the bar are returned
// unchanged (brand fidelity). Without this, a brand color near the background luminance (white on a
// light theme) vanishes the moment it is used as text — e.g. an accent-colored label on an
// accent-soft tint. This mirrors the hand-tuned default palette (bright accent on dark, darkened
// accent on light). The hue is preserved (mixing toward pure black/white scales channels linearly).
function ensureReadable(c: Rgb, bgL: number, target: 0 | 255): Rgb {
  if (contrastRatio(relativeLuminance(c), bgL) >= MIN_ACCENT_CONTRAST) return c;
  let out = c;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    out = mix(c, target, t);
    if (contrastRatio(relativeLuminance(out), bgL) >= MIN_ACCENT_CONTRAST)
      break;
  }
  return out;
}

export type Theme = "light" | "dark";

// The BRANDABLE_KEYS → CSS color value map derived from `brandHex` for `theme`.
// Returns null if the brand color is not a parseable #rrggbb.
export function derivePalette(
  brandHex: string,
  theme: Theme,
): Record<BrandableKey, string> | null {
  const raw = parseHex(brandHex);
  if (!raw) return null;
  const dark = theme === "dark";
  // The accent doubles as a TEXT color (links, soft-button labels), so keep it readable on the
  // theme background — adjusted toward the legible direction only when the brand color is too
  // close to the background. Everything else derives from this (already-legible) accent.
  const rgb = ensureReadable(
    raw,
    dark ? L_BG_DARK : L_BG_LIGHT,
    dark ? 255 : 0,
  );
  const accent = toHex(rgb);
  // Hover nudges toward the readable direction (lighter on a dark bg, darker on a light one).
  const accentHover = toHex(mix(rgb, dark ? 255 : 0, 0.14));
  // Foreground must contrast the accent fill: chosen by max WCAG contrast (black vs white).
  const accentForeground = pickForeground(rgb);
  // Muted moves opposite to hover (a recessive variant that still reads on the theme bg).
  const accentMuted = toHex(mix(rgb, dark ? 0 : 255, 0.2));
  // Soft is a translucent wash — alpha keeps it legible over either theme background.
  const accentSoft = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
  return {
    accent,
    accentHover,
    accentForeground,
    accentMuted,
    accentSoft,
    primary: accent,
  };
}
