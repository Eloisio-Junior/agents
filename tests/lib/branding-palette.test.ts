import { describe, expect, test } from "bun:test";
import { isValidColorToken } from "@/lib/branding";
import { derivePalette } from "@/lib/palette";

// Local WCAG helpers (mirror palette.ts) so assertions can check contrast directly.
function lum(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin((n >> 16) & 255);
  const g = toLin((n >> 8) & 255);
  const b = toLin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("isValidColorToken", () => {
  test("accepts hex / rgb / hsl / oklch", () => {
    for (const v of [
      "#fff",
      "#ffaa00",
      "#ffaa00cc",
      "rgb(10, 20, 30)",
      "rgba(10,20,30,0.5)",
      "hsl(200 50% 40%)",
      "oklch(0.7 0.15 250)",
    ]) {
      expect(isValidColorToken(v)).toBe(true);
    }
  });

  test("rejects url(), injection, expressions and bare names", () => {
    for (const v of [
      "url(https://evil/x.png)",
      "#fff; background: url(x)",
      "red", // bare named colors are not allowed
      "expression(alert(1))",
      "oklch(0.7); }",
      "var(--x)",
      "",
    ]) {
      expect(isValidColorToken(v)).toBe(false);
    }
  });
});

describe("derivePalette (SIMPLE mode color math)", () => {
  test("returns null for a non-#rrggbb brand color", () => {
    expect(derivePalette("not-a-color", "dark")).toBeNull();
    expect(derivePalette("#fff", "dark")).toBeNull(); // only 6-digit hex is derivable
    expect(derivePalette("rgb(1,2,3)", "light")).toBeNull();
  });

  test("accent + primary are the (normalized) brand color itself", () => {
    const p = derivePalette("#ABCDEF", "dark");
    expect(p?.accent).toBe("#abcdef");
    expect(p?.primary).toBe("#abcdef");
  });

  test("foreground flips by luminance so text always contrasts the accent", () => {
    // A light brand color → dark foreground; a dark brand color → light foreground.
    expect(derivePalette("#ffffff", "dark")?.accentForeground).toBe("#0f0f0f");
    expect(derivePalette("#ffffff", "light")?.accentForeground).toBe("#0f0f0f");
    expect(derivePalette("#000000", "dark")?.accentForeground).toBe("#f1f1f1");
    // A saturated blue needs white text in both themes.
    expect(derivePalette("#2563eb", "light")?.accentForeground).toBe("#f1f1f1");
    // A mid-bright accent (the default #3ea6ff) must pick BLACK text: white fails WCAG AA here,
    // black passes AAA. A single luminance threshold gets this wrong; the contrast ratio does not.
    expect(derivePalette("#3ea6ff", "dark")?.accentForeground).toBe("#0f0f0f");
    expect(derivePalette("#3ea6ff", "light")?.accentForeground).toBe("#0f0f0f");
  });

  test("soft is a translucent wash of the brand color", () => {
    expect(derivePalette("#2563eb", "dark")?.accentSoft).toBe(
      "rgba(37, 99, 235, 0.15)",
    );
  });

  test("accent stays legible as text on the theme background", () => {
    // A brand color that matches the background (white on the light theme) would vanish when used
    // as text (e.g. an accent-colored label on an accent-soft tint). It must be nudged to a legible
    // shade instead — and the same for black on the dark theme.
    const whiteLight = derivePalette("#ffffff", "light");
    expect(whiteLight?.accent).not.toBe("#ffffff");
    expect(
      contrast(whiteLight?.accent ?? "", "#f1f1f1"),
    ).toBeGreaterThanOrEqual(3.4);
    const blackDark = derivePalette("#000000", "dark");
    expect(blackDark?.accent).not.toBe("#000000");
    expect(contrast(blackDark?.accent ?? "", "#0f0f0f")).toBeGreaterThanOrEqual(
      3.4,
    );
  });

  test("an already-legible brand color is preserved (no needless shift)", () => {
    // A standard brand blue reads fine on both themes, so it is kept exactly.
    expect(derivePalette("#2563eb", "dark")?.accent).toBe("#2563eb");
    expect(derivePalette("#2563eb", "light")?.accent).toBe("#2563eb");
  });

  test("hover/muted move opposite directions per theme (theme-aware)", () => {
    const dark = derivePalette("#2563eb", "dark");
    const light = derivePalette("#2563eb", "light");
    // The brand stays put, but the derived tints differ between themes.
    expect(dark?.accentHover).not.toBe(light?.accentHover);
    expect(dark?.accentMuted).not.toBe(light?.accentMuted);
  });
});
