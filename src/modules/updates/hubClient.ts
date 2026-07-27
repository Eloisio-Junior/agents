import logger from "@/api/lib/logger";
import type {
  AnnouncementDTO,
  AnnouncementLevel,
  AnnouncementText,
} from "@/modules/updates/types";

const FETCH_TIMEOUT_MS = 5_000;

// Canonical edition union, reused by the service so the two spots can't drift.
export type Edition = "free" | "pro";

const ANNOUNCEMENT_LEVELS: ReadonlySet<AnnouncementLevel> = new Set([
  "INFO",
  "WARNING",
  "CRITICAL",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseText(value: unknown): AnnouncementText | null {
  if (!isRecord(value) || typeof value.body !== "string") return null;
  return {
    body: value.body,
    ...(typeof value.title === "string" ? { title: value.title } : {}),
  };
}

// The hub is first-party, but /api/updates is a network boundary and hub/agents versions can skew, so
// validate rather than blindly cast. Drops any entry that would break the console (missing id, unknown
// level, no `en` fallback body, malformed cta) instead of letting it reach the banner.
function parseAnnouncement(raw: unknown): AnnouncementDTO | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string") return null;
  if (
    typeof raw.level !== "string" ||
    !ANNOUNCEMENT_LEVELS.has(raw.level as AnnouncementLevel)
  ) {
    return null;
  }
  if (!isRecord(raw.content)) return null;

  const content: Record<string, AnnouncementText> = {};
  for (const [locale, value] of Object.entries(raw.content)) {
    const text = parseText(value);
    if (text) content[locale] = text;
  }
  if (!content.en) return null;

  let cta: AnnouncementDTO["cta"] = null;
  if (isRecord(raw.cta) && typeof raw.cta.url === "string") {
    const label: Record<string, string> = {};
    if (isRecord(raw.cta.label)) {
      for (const [locale, value] of Object.entries(raw.cta.label)) {
        if (typeof value === "string") label[locale] = value;
      }
    }
    cta = { url: raw.cta.url, label };
  }

  return {
    id: raw.id,
    level: raw.level as AnnouncementLevel,
    dismissible: typeof raw.dismissible === "boolean" ? raw.dismissible : true,
    content,
    cta,
  };
}

// Returns null on ANY failure (network, timeout, non-2xx, malformed JSON) so callers can fail open and
// keep a prior good result. Never throws.
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, "hub updates fetch non-2xx");
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    logger.debug({ error, url }, "hub updates fetch failed");
    return null;
  }
}

// A null return means "hub unreachable" (fail open, keep last good); an empty array means "hub
// reachable, nothing active".
export async function fetchAnnouncements(
  hubUrl: string,
  opts: { edition: Edition; version: string },
): Promise<AnnouncementDTO[] | null> {
  const qs = new URLSearchParams({
    instance_type: "AGENTS",
    edition: opts.edition,
  });
  if (opts.version && opts.version !== "0.0.0") qs.set("version", opts.version);
  const data = await fetchJson<{ announcements?: unknown }>(
    `${hubUrl}/api/announcements?${qs.toString()}`,
  );
  if (!data) return null;
  if (!Array.isArray(data.announcements)) return [];
  return data.announcements
    .map(parseAnnouncement)
    .filter((a): a is AnnouncementDTO => a !== null);
}

// `versionUrl` is the FULL endpoint (the hub's /api/latest-version, or a fork's own URL / static JSON);
// query params are appended and harmlessly ignored by a static file.
export async function fetchLatestVersion(
  versionUrl: string,
  opts: { edition: Edition },
): Promise<{ latestVersion: string | null; releaseUrl: string | null } | null> {
  const sep = versionUrl.includes("?") ? "&" : "?";
  const qs = new URLSearchParams({
    instance_type: "AGENTS",
    edition: opts.edition,
  });
  const data = await fetchJson<{
    latestVersion?: unknown;
    releaseUrl?: unknown;
  }>(`${versionUrl}${sep}${qs.toString()}`);
  if (!data) return null;
  // Validate the shape at this network boundary (same as fetchAnnouncements): only trust string
  // fields, otherwise null. A malformed latestVersion would otherwise reach compareSemver/href.
  return {
    latestVersion:
      typeof data.latestVersion === "string" ? data.latestVersion : null,
    releaseUrl: typeof data.releaseUrl === "string" ? data.releaseUrl : null,
  };
}
