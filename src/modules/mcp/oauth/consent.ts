import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  McpOAuthPendingAuthorization,
  PrismaClient,
} from "@/../generated/prisma/client";
import basePrisma from "@/api/lib/prisma";

// OAuth 2.1 consent state. A /authorize that is NOT auto-skipped (first-party client or a
// sufficient prior approval) parks a pending record here and redirects the user to the SPA consent
// screen; the screen reads the record and the user approves/denies. Security model mirrors the
// authorization code (grant.ts): the opaque request id is HASHED at rest, SINGLE-USE (CAS on
// consumed_at), 10-min TTL, bound to the user. The auth code is later minted from THIS record's
// fields — never from the consent POST body (anti-tamper). The mcp_oauth_* tables are GLOBAL (no
// RLS), accessed via the base client.

const PENDING_TTL_MS = 10 * 60_000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface CreatePendingParams {
  clientId: string;
  userId: bigint;
  tenantId: bigint | null;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string | null;
  state?: string | null;
  base?: PrismaClient;
}

// Parks a pending authorization; returns the opaque request id (in clear, once) that goes in the
// redirect to the consent screen. Stored hashed.
export async function createPendingAuthorization(
  params: CreatePendingParams,
): Promise<{ requestId: string }> {
  const base = params.base ?? basePrisma;
  const requestId = randomBytes(32).toString("base64url");
  await base.mcpOAuthPendingAuthorization.create({
    data: {
      requestHash: sha256(requestId),
      clientId: params.clientId,
      userId: params.userId,
      tenantId: params.tenantId,
      redirectUri: params.redirectUri,
      scopes: params.scopes,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      resource: params.resource ?? null,
      state: params.state ?? null,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  });
  return { requestId };
}

// Looks up a still-valid pending record for THIS user. Returns null if unknown, consumed, expired,
// or owned by a different user. Does NOT consume.
export async function getPendingAuthorization(
  requestId: string,
  userId: bigint,
  base: PrismaClient = basePrisma,
): Promise<McpOAuthPendingAuthorization | null> {
  const row = await base.mcpOAuthPendingAuthorization.findUnique({
    where: { requestHash: sha256(requestId) },
  });
  if (!row) return null;
  if (row.userId !== userId) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

// Mints a CSRF synchronizer token for the consent form and stores it hashed on the (still-valid)
// pending record. Returned in clear to the SPA via the consent GET body (unreadable cross-site by
// SOP); the consent POST must echo it back. Returns null if the record is no longer valid.
export async function issueConsentCsrf(
  requestId: string,
  userId: bigint,
  base: PrismaClient = basePrisma,
): Promise<string | null> {
  const row = await getPendingAuthorization(requestId, userId, base);
  if (!row) return null;
  const csrfToken = randomBytes(32).toString("base64url");
  const updated = await base.mcpOAuthPendingAuthorization.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { csrfTokenHash: sha256(csrfToken) },
  });
  if (updated.count === 0) return null;
  return csrfToken;
}

// Verifies the CSRF token and single-use-consumes the pending record (CAS). Returns the record only
// to the first consumer (a concurrent/replayed POST sees count 0 → null). The caller mints the auth
// code from the returned record's fields.
export async function consumePendingAuthorization(
  requestId: string,
  userId: bigint,
  csrfToken: string,
  base: PrismaClient = basePrisma,
): Promise<McpOAuthPendingAuthorization | null> {
  const row = await getPendingAuthorization(requestId, userId, base);
  if (!row) return null;
  if (
    !row.csrfTokenHash ||
    !constantTimeEqual(sha256(csrfToken), row.csrfTokenHash)
  ) {
    return null;
  }
  const consumed = await base.mcpOAuthPendingAuthorization.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return null;
  return row;
}

// ───────────────────────────── remembered approvals ──

export async function findApproval(
  userId: bigint,
  clientId: string,
  base: PrismaClient = basePrisma,
) {
  return base.mcpOAuthClientApproval.findUnique({
    where: { userId_clientId: { userId, clientId } },
  });
}

// Scope-aware: an approval lets /authorize skip consent only if every scope it would grant is
// already in the approved set (escalation re-prompts).
export function isApprovalSufficient(
  approved: string[],
  granted: string[],
): boolean {
  return granted.every((s) => approved.includes(s));
}

// Records (or widens) the user's approval for a client. Stores the UNION so a later narrower
// request stays covered; a wider one grows the set on the next approval.
export async function upsertApproval(
  userId: bigint,
  clientId: string,
  scopes: string[],
  base: PrismaClient = basePrisma,
): Promise<void> {
  const existing = await findApproval(userId, clientId, base);
  const merged = existing
    ? Array.from(new Set([...existing.scopes, ...scopes]))
    : scopes;
  await base.mcpOAuthClientApproval.upsert({
    where: { userId_clientId: { userId, clientId } },
    create: { userId, clientId, scopes: merged },
    update: { scopes: merged },
  });
}
