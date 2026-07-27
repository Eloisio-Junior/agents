import { describe, expect, test } from "bun:test";
import { compareSemver, isUpdateAvailable } from "@/modules/updates/semver";

describe("compareSemver", () => {
  test("orders by major, minor, then patch", () => {
    expect(compareSemver("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemver("1.1.9", "1.2.0")).toBe(-1);
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  test("tolerates a leading v and compares pre-release/build by their base", () => {
    expect(compareSemver("v1.2.0", "1.2.0")).toBe(0);
    expect(compareSemver("1.2.0-rc.1", "1.2.0")).toBe(0);
    expect(compareSemver("1.2.0+build.5", "1.2.0")).toBe(0);
  });

  test("returns 0 for unparseable input (never guesses)", () => {
    expect(compareSemver("", "1.0.0")).toBe(0);
    expect(compareSemver("latest", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "not-a-version")).toBe(0);
  });

  test("treats missing segments as zero", () => {
    expect(compareSemver("1.2", "1.2.0")).toBe(0);
    expect(compareSemver("1", "1.0.1")).toBe(-1);
  });
});

describe("isUpdateAvailable", () => {
  test("true only when latest is strictly newer than current", () => {
    expect(isUpdateAvailable("1.1.0", "1.2.0")).toBe(true);
    expect(isUpdateAvailable("1.2.0", "1.2.0")).toBe(false);
    expect(isUpdateAvailable("1.3.0", "1.2.0")).toBe(false);
  });

  test("suppressed for the 0.0.0 dev/master placeholder", () => {
    expect(isUpdateAvailable("0.0.0", "1.2.0")).toBe(false);
  });

  test("false when latest is missing or unparseable", () => {
    expect(isUpdateAvailable("1.0.0", null)).toBe(false);
    expect(isUpdateAvailable("1.0.0", "")).toBe(false);
    expect(isUpdateAvailable("1.0.0", "nightly")).toBe(false);
  });
});
