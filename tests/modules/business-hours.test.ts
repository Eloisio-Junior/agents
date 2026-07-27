import { describe, expect, test } from "bun:test";
import {
  isOpenAt,
  nextOpenAt,
  parseWindows,
} from "@/modules/business-hours/hours";

const SP = "America/Sao_Paulo"; // UTC-3, no DST since 2019
const NY = "America/New_York"; // EST (UTC-5) / EDT (UTC-4)

// Mon–Fri 09:00–18:00 in the given tz.
const weekdayWindows = [1, 2, 3, 4, 5].map((day) => ({
  day,
  start: "09:00",
  end: "18:00",
}));
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  start: "09:00",
  end: "17:00",
}));

describe("parseWindows", () => {
  test("validates shape; drops invalid", () => {
    expect(
      parseWindows([{ day: 1, start: "09:00", end: "18:00" }]),
    ).toHaveLength(1);
    expect(parseWindows([{ day: 9, start: "09:00", end: "18:00" }])).toEqual(
      [],
    );
    expect(parseWindows([{ day: 1, start: "9:00", end: "18:00" }])).toEqual([]);
    expect(parseWindows("nope")).toEqual([]);
  });

  test("drops dead windows (end <= start) but keeps valid siblings", () => {
    // end before start (would-be overnight) and a zero-length window are no-ops:
    // isOpenAt can never match them, so parseWindows must not surface them.
    expect(
      parseWindows([
        { day: 2, start: "08:00", end: "02:00" },
        { day: 3, start: "09:00", end: "09:00" },
        { day: 4, start: "09:00", end: "18:00" },
      ]),
    ).toEqual([{ day: 4, start: "09:00", end: "18:00" }]);
  });

  test("a dead window is never open and never reported as next-open", () => {
    const dead = [{ day: 2, start: "08:00", end: "02:00" }];
    // Tue 12:00 SP would be inside 08:00–02:00 only if it wrapped; it must not.
    expect(isOpenAt(dead, SP, new Date("2026-06-02T15:00:00Z"))).toBe(false);
    expect(nextOpenAt(dead, SP, new Date("2026-06-01T12:00:00Z"))).toBeNull();
  });
});

describe("isOpenAt (São Paulo, UTC-3)", () => {
  test("Monday 12:00 local is open", () => {
    // 2026-06-01T15:00Z = Mon 12:00 in SP
    expect(isOpenAt(weekdayWindows, SP, new Date("2026-06-01T15:00:00Z"))).toBe(
      true,
    );
  });
  test("Sunday is closed", () => {
    expect(isOpenAt(weekdayWindows, SP, new Date("2026-05-31T15:00:00Z"))).toBe(
      false,
    );
  });
  test("before opening is closed", () => {
    // 2026-06-01T11:00Z = Mon 08:00 SP (before 09:00)
    expect(isOpenAt(weekdayWindows, SP, new Date("2026-06-01T11:00:00Z"))).toBe(
      false,
    );
  });
});

describe("nextOpenAt", () => {
  test("returns the instant itself when already open", () => {
    const at = new Date("2026-06-01T15:00:00Z");
    expect(nextOpenAt(weekdayWindows, SP, at)?.toISOString()).toBe(
      at.toISOString(),
    );
  });

  test("from a Sunday → Monday 09:00 SP (12:00Z)", () => {
    const at = new Date("2026-05-31T10:00:00Z"); // Sun 07:00 SP
    expect(nextOpenAt(weekdayWindows, SP, at)?.toISOString()).toBe(
      "2026-06-01T12:00:00.000Z",
    );
  });

  test("no windows → null", () => {
    expect(nextOpenAt([], SP, new Date())).toBeNull();
  });

  test("DST: 09:00 New York maps to a different UTC hour in winter vs summer", () => {
    // Winter (EST, UTC-5): closed at 07:00 EST → next open 09:00 EST = 14:00Z
    const winter = nextOpenAt(everyDay, NY, new Date("2026-01-10T12:00:00Z"));
    expect(winter?.toISOString()).toBe("2026-01-10T14:00:00.000Z");
    // Summer (EDT, UTC-4): closed at 08:00 EDT → next open 09:00 EDT = 13:00Z
    const summer = nextOpenAt(everyDay, NY, new Date("2026-07-10T12:00:00Z"));
    expect(summer?.toISOString()).toBe("2026-07-10T13:00:00.000Z");
  });

  test("the returned instant is itself open (round-trip)", () => {
    const at = new Date("2026-05-31T10:00:00Z");
    const next = nextOpenAt(weekdayWindows, SP, at);
    expect(next).not.toBeNull();
    expect(isOpenAt(weekdayWindows, SP, next as Date)).toBe(true);
  });
});
