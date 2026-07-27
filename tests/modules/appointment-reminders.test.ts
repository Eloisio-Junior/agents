import { describe, expect, test } from "bun:test";
import {
  computeReminderJobs,
  enqueueAppointmentReminders,
  reminderNudge,
} from "@/modules/appointments/reminders";
import {
  APPOINTMENT_REMINDER_DEFAULTS,
  normalizeOffsets,
  readAppointmentReminderConfig,
} from "@/modules/appointments/settings";
import type { enqueueJob } from "@/modules/scheduler/service";

describe("normalizeOffsets", () => {
  test("keeps valid hours, sorted descending", () => {
    expect(normalizeOffsets([1, 24])).toEqual([24, 1]);
  });
  test("de-dups and rounds", () => {
    expect(normalizeOffsets([24, 24, 2.7, 1])).toEqual([24, 3, 1]);
  });
  test("clamps to [1, 8760] and drops non-numbers", () => {
    expect(normalizeOffsets([0.4, -5, 99999, "x", null, 2])).toEqual([
      8760, 2, 1,
    ]);
  });
  test("caps at 5 offsets", () => {
    expect(normalizeOffsets([100, 90, 80, 70, 60, 50, 40])).toEqual([
      100, 90, 80, 70, 60,
    ]);
  });
});

describe("readAppointmentReminderConfig", () => {
  test("absent → defaults (disabled, [24,1], confirm on last)", () => {
    expect(readAppointmentReminderConfig(undefined)).toEqual(
      APPOINTMENT_REMINDER_DEFAULTS,
    );
    expect(readAppointmentReminderConfig({})).toEqual(
      APPOINTMENT_REMINDER_DEFAULTS,
    );
  });
  test("reads + normalizes a configured block", () => {
    expect(
      readAppointmentReminderConfig({
        appointmentReminders: {
          enabled: true,
          offsetsHours: [2, 48, 48],
          askConfirmationOnLast: false,
        },
      }),
    ).toEqual({
      enabled: true,
      offsetsHours: [48, 2],
      askConfirmationOnLast: false,
    });
  });
  test("an empty/invalid offsets array falls back to the defaults", () => {
    expect(
      readAppointmentReminderConfig({
        appointmentReminders: { enabled: true, offsetsHours: [] },
      }).offsetsHours,
    ).toEqual([24, 1]);
  });
});

describe("computeReminderJobs", () => {
  const start = "2026-06-25T10:00:00-03:00";
  test("one job per offset, runAt = start − offset, smallest flagged isLast", () => {
    const jobs = computeReminderJobs(
      start,
      [24, 1],
      new Date("2026-06-24T00:00:00-03:00"),
    );
    expect(jobs.map((j) => j.offsetHours)).toEqual([24, 1]);
    expect(jobs[0]?.runAt.toISOString()).toBe(
      new Date("2026-06-24T10:00:00-03:00").toISOString(),
    );
    expect(jobs[1]?.runAt.toISOString()).toBe(
      new Date("2026-06-25T09:00:00-03:00").toISOString(),
    );
    expect(jobs.map((j) => j.isLast)).toEqual([false, true]);
  });
  test("skips offsets whose reminder time is already in the past", () => {
    const jobs = computeReminderJobs(
      start,
      [24, 1],
      new Date("2026-06-24T12:00:00-03:00"), // 24h reminder (10:00) already passed
    );
    expect(jobs.map((j) => j.offsetHours)).toEqual([1]);
    expect(jobs[0]?.isLast).toBe(true);
  });
  test("invalid start → no jobs", () => {
    expect(computeReminderJobs("not-a-date", [24], new Date())).toEqual([]);
  });
});

describe("reminderNudge", () => {
  test("last + confirmation → asks to confirm and to mark the event", () => {
    const n = reminderNudge(
      true,
      true,
      "Consulta",
      "2026-06-25T10:00:00-03:00",
    );
    expect(n.source).toBe("appointment_reminder");
    expect(n.instructions).toContain("confirm");
    expect(n.instructions).toContain("calendar_confirm_appointment");
    expect(n.summary).toContain("Consulta");
  });
  test("not the last reminder → plain reminder, no confirmation", () => {
    const n = reminderNudge(false, true, "Consulta", "x");
    expect(n.instructions).not.toContain("calendar_confirm_appointment");
  });
  test("last but confirmation disabled → plain reminder", () => {
    const n = reminderNudge(true, false, "Consulta", "x");
    expect(n.instructions).not.toContain("calendar_confirm_appointment");
  });
});

describe("enqueueAppointmentReminders", () => {
  function fakeEnqueue() {
    const calls: Array<Parameters<typeof enqueueJob>[0]> = [];
    const fn = (async (p: Parameters<typeof enqueueJob>[0]) => {
      calls.push(p);
      return 1n;
    }) as typeof enqueueJob;
    return { fn, calls };
  }

  test("enqueues one job per offset with the reminder dedupeKey + payload", async () => {
    const { fn, calls } = fakeEnqueue();
    const n = await enqueueAppointmentReminders(
      {
        tenantId: 1n,
        threadId: "1:2:3",
        eventId: "ev_1",
        calendarId: "primary",
        credentialRef: "vault:9",
        startISO: "2026-06-25T10:00:00-03:00",
        offsetsHours: [24, 1],
        askConfirmationOnLast: true,
        now: new Date("2026-06-24T00:00:00-03:00"),
      },
      fn,
    );
    expect(n).toBe(2);
    expect(calls.map((c) => c.dedupeKey)).toEqual([
      "reminder:ev_1:24",
      "reminder:ev_1:1",
    ]);
    expect(calls.every((c) => c.kind === "APPOINTMENT_REMINDER")).toBe(true);
    expect(calls[1]?.payload).toMatchObject({
      threadId: "1:2:3",
      eventId: "ev_1",
      calendarId: "primary",
      credentialRef: "vault:9",
      offsetHours: 1,
      isLast: true,
      askConfirmation: true,
    });
  });
});
