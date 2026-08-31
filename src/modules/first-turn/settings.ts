import { clipText } from "@/lib/text";

export const FIRST_TURN_PREFIX_MAX = 2000;

export interface FirstTurnGuardConfig {
  enabled: boolean;
  prefix: string;
}

export const FIRST_TURN_GUARD_DEFAULTS: FirstTurnGuardConfig = {
  enabled: false,
  prefix: "",
};

export function readFirstTurnGuardConfig(
  settings: unknown,
): FirstTurnGuardConfig {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...FIRST_TURN_GUARD_DEFAULTS };
  }
  const raw = (settings as Record<string, unknown>).firstTurnGuard;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...FIRST_TURN_GUARD_DEFAULTS };
  }
  const bag = raw as Record<string, unknown>;
  const prefix =
    typeof bag.prefix === "string"
      ? clipText(bag.prefix.trim(), FIRST_TURN_PREFIX_MAX)
      : "";
  return {
    enabled: bag.enabled === true && prefix.length > 0,
    prefix,
  };
}

