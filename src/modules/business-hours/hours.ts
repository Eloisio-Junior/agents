import { z } from "zod";

// Pure business-hours time logic (DST-correct via Intl; Temporal is unavailable in Bun). A window
// is {day, start, end} where day is 0=Sunday..6=Saturday and start/end are "HH:MM" local wall
// times in the configured IANA timezone. Used by follow-ups and out-of-hours behavior — never
// embeds I/O, so it is deterministic and unit-testable with fixed instants (incl. DST boundaries).

export const windowSpecSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type WindowSpec = z.infer<typeof windowSpecSchema>;

export function parseWindows(raw: unknown): WindowSpec[] {
  const parsed = z.array(windowSpecSchema).safeParse(raw);
  if (!parsed.success) return [];
  // Drop dead windows (end <= start). The half-open [start, end) test in
  // isOpenAt can never match them, so they would only feed an impossible window
  // to nextOpenAt. Writes reject these (assertValidWindows); this also heals
  // rows persisted before that validation existed.
  return parsed.data.filter(isWindowOrdered);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

// A window is well-formed only when its end is strictly after its start. The
// implementation does not model overnight windows (end < start crossing
// midnight): express those as two windows, e.g. Tue 08:00–23:59 + Wed 00:00–02:00.
export function isWindowOrdered(w: WindowSpec): boolean {
  return toMinutes(w.end) > toMinutes(w.start);
}

interface ZonedParts {
  weekday: number; // 0=Sun..6=Sat
  minutes: number; // minutes since local midnight
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// The local wall-clock weekday + minute-of-day for an instant in a timezone.
function zonedParts(at: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const part of fmt.formatToParts(at)) {
    if (part.type === "weekday") weekday = WEEKDAY_INDEX[part.value] ?? 0;
    else if (part.type === "hour") hour = Number(part.value) % 24;
    else if (part.type === "minute") minute = Number(part.value);
  }
  return { weekday, minutes: hour * 60 + minute };
}

export function isOpenAt(windows: WindowSpec[], tz: string, at: Date): boolean {
  const { weekday, minutes } = zonedParts(at, tz);
  return windows.some(
    (w) =>
      w.day === weekday &&
      minutes >= toMinutes(w.start) &&
      minutes < toMinutes(w.end),
  );
}

// "Is this schedule currently CLOSED?" — true only when an availability schedule is configured (≥1
// window) AND `at` falls outside every window. No windows = always-on, so never out of hours. Shared
// by the operator-facing "out of hours" badge (conversation header, lists) and the reactive gate.
export function isOutOfHoursNow(
  windows: WindowSpec[],
  tz: string,
  at: Date,
): boolean {
  if (windows.length === 0) return false;
  return !isOpenAt(windows, tz, at);
}

// Does the interval [start, end] fit ENTIRELY inside one of the schedule's windows? True only when
// start and end fall on the same local weekday (no midnight crossing) and both land within a single
// window for that day (start inclusive, end inclusive at the window's close). This is the slot-fit
// test the appointment-availability tool uses to keep candidate slots inside the service hours.
export function fitsWithinWindows(
  windows: WindowSpec[],
  tz: string,
  start: Date,
  end: Date,
): boolean {
  const s = zonedParts(start, tz);
  const e = zonedParts(end, tz);
  if (s.weekday !== e.weekday) return false;
  if (e.minutes <= s.minutes) return false;
  return windows.some(
    (w) =>
      w.day === s.weekday &&
      s.minutes >= toMinutes(w.start) &&
      e.minutes <= toMinutes(w.end),
  );
}

// The tz offset (ms to ADD to UTC to get local wall time) at a given instant.
function tzOffsetMs(tz: string, instant: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    p.year as number,
    (p.month as number) - 1,
    p.day as number,
    (p.hour as number) % 24,
    p.minute as number,
    p.second as number,
  );
  return asUtc - instant.getTime();
}

// UTC instant for a local wall time (two-pass, DST-correct). Ambiguous/skipped wall times near a
// transition resolve to a deterministic neighboring instant — acceptable for scheduling.
function zonedTimeToUtc(
  tz: string,
  y: number,
  mo: number,
  d: number,
  minutes: number,
): Date {
  const guess = Date.UTC(y, mo, d, Math.floor(minutes / 60), minutes % 60);
  const off1 = tzOffsetMs(tz, new Date(guess));
  let utc = guess - off1;
  const off2 = tzOffsetMs(tz, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

function localYmd(at: Date, tz: string): { y: number; mo: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return {
    y: p.year as number,
    mo: (p.month as number) - 1,
    d: p.day as number,
  };
}

// The next instant the business is open at or after `at`. Returns `at` itself when already open,
// or null when there are no windows. Scans up to 14 days ahead to cover sparse schedules.
export function nextOpenAt(
  rawWindows: WindowSpec[],
  tz: string,
  at: Date,
): Date | null {
  // Drop dead windows up front: unlike isOpenAt (whose [start, end) test simply
  // never matches them), the scan below keys off w.start alone and would
  // otherwise return a bogus "open" instant for an end <= start window.
  const windows = rawWindows.filter(isWindowOrdered);
  if (windows.length === 0) return null;
  if (isOpenAt(windows, tz, at)) return at;

  const { y, mo, d } = localYmd(at, tz);
  let best: number | null = null;
  for (let offset = 0; offset <= 14; offset++) {
    const dayDate = new Date(Date.UTC(y, mo, d + offset));
    const weekday = dayDate.getUTCDay();
    for (const w of windows) {
      if (w.day !== weekday) continue;
      const start = zonedTimeToUtc(
        tz,
        dayDate.getUTCFullYear(),
        dayDate.getUTCMonth(),
        dayDate.getUTCDate(),
        toMinutes(w.start),
      ).getTime();
      if (start > at.getTime() && (best === null || start < best)) best = start;
    }
    if (best !== null) return new Date(best);
  }
  return null;
}
