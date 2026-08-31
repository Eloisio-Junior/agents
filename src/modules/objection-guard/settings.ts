import { clipText } from "@/lib/text";

export const OBJECTION_GUARD_PATTERN_MAX = 200;
export const OBJECTION_GUARD_PATTERNS_MAX = 50;

export interface ObjectionGuardConfig {
  enabled: boolean;
  openObjectionPatterns: string[];
  definitiveRefusalPatterns: string[];
}

export const OBJECTION_GUARD_DEFAULTS: ObjectionGuardConfig = {
  enabled: false,
  openObjectionPatterns: [],
  definitiveRefusalPatterns: [],
};

function patterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => clipText(item.trim(), OBJECTION_GUARD_PATTERN_MAX))
        .filter(Boolean),
    ),
  ];
  const result: string[] = [];
  for (const item of unique) {
    if (result.length >= OBJECTION_GUARD_PATTERNS_MAX) break;
    result.push(item);
  }
  return result;
}

export function readObjectionGuardConfig(
  settings: unknown,
): ObjectionGuardConfig {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...OBJECTION_GUARD_DEFAULTS };
  }
  const raw = (settings as Record<string, unknown>).objectionGuard;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...OBJECTION_GUARD_DEFAULTS };
  }
  const bag = raw as Record<string, unknown>;
  const openObjectionPatterns = patterns(bag.openObjectionPatterns);
  const definitiveRefusalPatterns = patterns(bag.definitiveRefusalPatterns);
  return {
    enabled: bag.enabled === true && openObjectionPatterns.length > 0,
    openObjectionPatterns,
    definitiveRefusalPatterns,
  };
}
