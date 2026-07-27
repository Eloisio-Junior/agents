// Shapes served to the frontend by GET /api/updates. `AnnouncementDTO` mirrors exactly what the hub's
// public GET /api/announcements returns (all locales in `content`; the client resolves its own locale).
export type AnnouncementLevel = "INFO" | "WARNING" | "CRITICAL";

export interface AnnouncementText {
  title?: string;
  body: string;
}

export interface AnnouncementDTO {
  id: string;
  level: AnnouncementLevel;
  dismissible: boolean;
  // Keyed by locale (e.g. "en", "pt-BR"); "en" is always present as the fallback.
  content: Record<string, AnnouncementText>;
  cta: { url: string; label: Record<string, string> } | null;
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
}

export interface UpdatesPayload {
  announcements: AnnouncementDTO[];
  update: UpdateInfo;
}
