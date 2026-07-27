import type { TFunction } from "i18next";

type ClassValue = string | undefined | null | false | Record<string, boolean>;

/**
 * Merges class names, filtering out falsy values.
 * Supports strings and objects with boolean values.
 * @example cn("base", { "active": isActive, "disabled": isDisabled })
 */
export function cn(...classes: ClassValue[]): string {
  return classes
    .flatMap((c) => {
      if (!c) return [];
      if (typeof c === "string") return c;
      return Object.entries(c)
        .filter(([, v]) => v)
        .map(([k]) => k);
    })
    .join(" ");
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { timeZone: "UTC" });
}

// Locale-aware absolute date+time, for tooltips/titles next to a relative label.
export function formatDateTime(
  date: string | Date | null | undefined,
  locale: string,
): string {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

const RELATIVE_DIVISIONS: {
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

// "2 days ago" / "in 3 hours" in the active language, via Intl.RelativeTimeFormat.
export function formatRelativeTime(
  date: string | Date | null | undefined,
  locale: string,
): string {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  let duration = (d.getTime() - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "year");
}

// Mirrors the server-side tenant slug shape (tenants.service.ts): lowercase alphanumerics and
// single hyphens, no leading/trailing hyphen. Kept in sync manually (no shared module across the
// client/server boundary here).
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

// Derives a slug from free text: strip diacritics (NFD), lowercase, collapse any run of
// non-alphanumerics into a single hyphen, and trim hyphens. The result always satisfies
// SLUG_PATTERN (or is empty for input with no alphanumerics).
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

import { CDN_URL } from "@/client/lib/env";

// Maps an HTTP status from a failed fetch to a user-facing load-error message. 429 (rate limited)
// gets a specific hint; everything else falls back to the caller's label or the generic message.
export function loadErrorMessage(
  t: TFunction,
  status?: number | null,
  fallback?: string,
): string {
  if (status === 429) {
    return t(
      "common.rateLimited",
      "Too many requests. Wait a moment and try again.",
    );
  }
  return fallback ?? t("common.loadError", "Could not load data.");
}

// True only for absolute http(s) URLs. Guard any externally-sourced value (a hub-authored
// announcement CTA, a release URL) with this before putting it in an anchor href, so a
// `javascript:`/`data:` scheme can never ride in.
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function getAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    throw new Error(
      `getAssetUrl received an absolute URL (${path}). Pass a bare asset path; useThemedAsset already applies the CDN prefix.`,
    );
  }
  if (!CDN_URL) return path;
  return `${CDN_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
