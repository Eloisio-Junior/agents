import { randomBytes, timingSafeEqual } from "node:crypto";
import logger from "@/api/lib/logger";
import prisma from "@/api/lib/prisma";
import config from "@/config";

// NOTE: In-memory state is a UX optimization so /auth/me and the signup gates
// can answer "is setup still pending?" without a query on the happy path. It is
// NOT the race guard: the atomic insert in createInitialAdmin (advisory lock +
// re-check) is what guarantees a single bootstrap, correct even across
// instances that each hold their own stale flag.
let setupToken: string | null = null;
let setupComplete = false;

function generateSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function initSetupState(): Promise<void> {
  const existing = await prisma.user.findFirst({ select: { id: true } });
  if (existing) {
    setupComplete = true;
    setupToken = null;
    return;
  }

  setupComplete = false;
  const setupUrl = `${config.publicUrl}/setup`;
  if (config.setupTokenRequired) {
    setupToken = generateSetupToken();
    logger.info(
      `First-run setup required: no users exist yet. Create the initial admin account at ${setupUrl}?token=${setupToken}`,
    );
  } else {
    setupToken = null;
    logger.info(
      `First-run setup required: no users exist yet. SETUP_TOKEN_REQUIRED is disabled; create the initial admin account at ${setupUrl}`,
    );
  }
}

export function isSetupRequired(): boolean {
  return !setupComplete;
}

// NOTE: Self-heals a stale in-memory `setupComplete=false`. Two cases:
// (1) The DB has users (multi-instance: another replica or `bun set-admin`
//     created the first user since this replica booted). Flip the local flag.
// (2) The DB has no users AND `setupToken` is null (boot-time DB outage where
//     `initSetupState()` bailed before it could generate a token). Generate a
//     token now and log the URL so SETUP_TOKEN_REQUIRED mode is not
//     permanently broken on this replica until restart. The freshly-logged
//     URL is what the operator uses; the original `initSetupState()` warning
//     in the log gives them the bread crumb to scroll forward to this entry.
// Short-circuits when the local flag is already true so only a stale replica
// pays the round-trip.
export async function refreshSetupState(): Promise<void> {
  if (setupComplete) return;
  const existing = await prisma.user.findFirst({ select: { id: true } });
  if (existing) {
    completeSetup();
    return;
  }
  if (config.setupTokenRequired && !setupToken) {
    setupToken = generateSetupToken();
    logger.info(
      `First-run setup required: no users exist yet. Create the initial admin account at ${config.publicUrl}/setup?token=${setupToken}`,
    );
  }
}

export function isSetupTokenRequired(): boolean {
  return config.setupTokenRequired;
}

export function verifySetupToken(token?: string): boolean {
  if (!config.setupTokenRequired) return true;
  if (!setupToken || typeof token !== "string") return false;
  const provided = Buffer.from(token);
  const expected = Buffer.from(setupToken);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function completeSetup(): void {
  setupComplete = true;
  setupToken = null;
}
