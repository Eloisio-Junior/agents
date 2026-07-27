export type WindowSpec = {
  day: number; // 0=Sunday…6=Saturday
  start: string; // "HH:MM"
  end: string;
};

// NOTE: Intl gives the localized weekday name so we don't need per-language i18n keys.
// 2024-01-07 is a Sunday, so day index 0..6 maps directly.
function dayName(day: number, locale: string): string {
  const ref = new Date(2024, 0, 7 + day);
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(ref);
}

// Groups consecutive days sharing the same set of windows into a compact summary like
// "Seg–Sex 09:00–18:00 · Sáb 09:00–13:00". A day may have multiple windows
// ("Seg–Sex 09:00–12:00, 14:00–18:00"); days without windows are omitted; empty input
// returns the `noWindows` fallback.
export function formatWindowsSummary(
  windows: WindowSpec[],
  noWindows: string,
  locale: string,
): string {
  if (!windows.length) return noWindows;

  const byDay = new Map<number, string[]>();
  for (const w of windows) {
    const slots = byDay.get(w.day) ?? [];
    slots.push(`${w.start}–${w.end}`);
    byDay.set(w.day, slots);
  }
  for (const slots of byDay.values()) slots.sort();

  type Run = { days: number[]; key: string; label: string };
  const runs: Run[] = [];
  for (let d = 0; d <= 6; d++) {
    const slots = byDay.get(d);
    if (!slots) continue;
    const key = slots.join("|");
    const last = runs[runs.length - 1];
    if (last && last.key === key && last.days[last.days.length - 1] === d - 1) {
      last.days.push(d);
    } else {
      runs.push({ days: [d], key, label: slots.join(", ") });
    }
  }

  return runs
    .map(({ days, label }) => {
      const first = dayName(days[0] as number, locale);
      const last =
        days.length > 1
          ? dayName(days[days.length - 1] as number, locale)
          : null;
      const dayPart = last ? `${first}–${last}` : first;
      return `${dayPart} ${label}`;
    })
    .join(" · ");
}
