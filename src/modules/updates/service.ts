import config from "@/config";
import {
  type Edition,
  fetchAnnouncements,
  fetchLatestVersion,
} from "@/modules/updates/hubClient";
import { isUpdateAvailable } from "@/modules/updates/semver";
import type {
  AnnouncementDTO,
  UpdateInfo,
  UpdatesPayload,
} from "@/modules/updates/types";

// Short TTL after a failed/partial hub fetch so recovery is quick without hammering the hub.
const FAILURE_TTL_MS = 5 * 60_000;

type LatestResult = { latestVersion: string | null; releaseUrl: string | null };

let cache: { at: number; ttl: number; value: UpdatesPayload } | null = null;
// Each half is remembered independently so one failing sub-fetch can't blank out the healthy half.
let lastGoodAnnouncements: AnnouncementDTO[] | null = null;
let lastGoodLatest: LatestResult | null = null;
// Single-flight guard: concurrent getUpdates() calls after TTL expiry share one hub round-trip instead
// of each firing their own.
let inFlight: Promise<{ value: UpdatesPayload; ok: boolean }> | null = null;

function edition(): Edition {
  return config.edition === "free" ? "free" : "pro";
}

function buildUpdate(latest: LatestResult | null): UpdateInfo {
  const currentVersion = config.packageInfo.version;
  const latestVersion = latest?.latestVersion ?? null;
  return {
    available: isUpdateAvailable(currentVersion, latestVersion),
    currentVersion,
    latestVersion,
    releaseUrl: latest?.releaseUrl ?? null,
  };
}

function emptyPayload(): UpdatesPayload {
  return { announcements: [], update: buildUpdate(null) };
}

// Serve the best available payload from whatever last succeeded per half (used on hard failure).
function fallbackPayload(): UpdatesPayload {
  return {
    announcements: lastGoodAnnouncements ?? [],
    update: buildUpdate(lastGoodLatest),
  };
}

async function compute(): Promise<{ value: UpdatesPayload; ok: boolean }> {
  const currentVersion = config.packageInfo.version;
  const versionUrl =
    config.hub.updateCheckUrl || `${config.hub.url}/api/latest-version`;

  const [announcements, latest] = await Promise.all([
    fetchAnnouncements(config.hub.url, {
      edition: edition(),
      version: currentVersion,
    }),
    fetchLatestVersion(versionUrl, { edition: edition() }),
  ]);

  // Remember each healthy half; a null (failed) half reuses its own last-good instead of dragging the
  // whole payload into failure mode. So a flaky latest-version endpoint no longer suppresses fresh
  // announcements, and vice versa.
  if (announcements !== null) lastGoodAnnouncements = announcements;
  if (latest !== null) lastGoodLatest = latest;

  return {
    // "ok" (full TTL) only when BOTH halves are fresh; a partial success keeps the short FAILURE_TTL so
    // the missing half retries soon.
    ok: announcements !== null && latest !== null,
    value: {
      announcements: announcements ?? lastGoodAnnouncements ?? [],
      update: buildUpdate(latest ?? lastGoodLatest),
    },
  };
}

// Cached, fail-open aggregate of hub announcements + the latest-version check. NEVER throws: a hub
// outage yields the last good payload (or an empty one). The TTL keeps hub traffic to roughly one
// request per instance per hour; the frontend polls the controller that wraps this.
export async function getUpdates(): Promise<UpdatesPayload> {
  // Hub disabled (air-gapped / fork): serve an empty payload, no network.
  if (!config.hub.url) return emptyPayload();

  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.value;

  try {
    // Dedupe concurrent callers onto one compute() so the hub sees a single request per expiry.
    if (!inFlight) {
      inFlight = compute().finally(() => {
        inFlight = null;
      });
    }
    const { value, ok } = await inFlight;
    // compute() already merges in each half's last-good, so `value` is exactly what we serve.
    cache = {
      at: now,
      ttl: ok ? config.hub.updatesTtlMs : FAILURE_TTL_MS,
      value,
    };
    return value;
  } catch {
    return fallbackPayload();
  }
}

// Test/ops seam: drop the memo so the next call refetches.
export function resetUpdatesCache(): void {
  cache = null;
  inFlight = null;
  lastGoodAnnouncements = null;
  lastGoodLatest = null;
}
