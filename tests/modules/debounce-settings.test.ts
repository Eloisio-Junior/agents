import { describe, expect, test } from "bun:test";
import {
  DEBOUNCE_DEFAULTS,
  readDebounceConfig,
} from "@/modules/debounce/settings";

describe("readDebounceConfig", () => {
  test("returns defaults when absent or empty", () => {
    expect(readDebounceConfig(undefined)).toEqual(DEBOUNCE_DEFAULTS);
    expect(readDebounceConfig({})).toEqual(DEBOUNCE_DEFAULTS);
    expect(readDebounceConfig({ debounce: {} })).toEqual(DEBOUNCE_DEFAULTS);
  });

  test("clamps windowSeconds into [3, 120]", () => {
    expect(
      readDebounceConfig({ debounce: { windowSeconds: 1 } }).windowSeconds,
    ).toBe(3);
    expect(
      readDebounceConfig({ debounce: { windowSeconds: 9999 } }).windowSeconds,
    ).toBe(120);
    expect(
      readDebounceConfig({ debounce: { windowSeconds: 30 } }).windowSeconds,
    ).toBe(30);
  });

  test("clamps maxMessagesPerBurst into [1, 50]", () => {
    expect(
      readDebounceConfig({ debounce: { maxMessagesPerBurst: 0 } })
        .maxMessagesPerBurst,
    ).toBe(1);
    expect(
      readDebounceConfig({ debounce: { maxMessagesPerBurst: 999 } })
        .maxMessagesPerBurst,
    ).toBe(50);
  });

  test("maxWindowSeconds is clamped up to the window (never shorter)", () => {
    const c = readDebounceConfig({
      debounce: { windowSeconds: 40, maxWindowSeconds: 10 },
    });
    expect(c.windowSeconds).toBe(40);
    expect(c.maxWindowSeconds).toBe(40);
  });

  test("respects an explicit enabled=false", () => {
    expect(readDebounceConfig({ debounce: { enabled: false } }).enabled).toBe(
      false,
    );
  });

  test("falls back to defaults for malformed values", () => {
    const c = readDebounceConfig({
      debounce: { windowSeconds: "x", maxMessagesPerBurst: null },
    });
    expect(c.windowSeconds).toBe(DEBOUNCE_DEFAULTS.windowSeconds);
    expect(c.maxMessagesPerBurst).toBe(DEBOUNCE_DEFAULTS.maxMessagesPerBurst);
  });
});
