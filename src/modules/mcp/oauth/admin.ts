import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/../generated/prisma/client";
import basePrisma from "@/api/lib/prisma";
import { AppError, NotFoundError } from "@/lib/errors";
import { validateRedirectUris } from "@/modules/mcp/oauth/dcr";
import { MCP_SCOPES, revokeAccessToken } from "@/modules/mcp/oauth/tokens";

// Admin management of OUR MCP server (the third transport) — OAuth clients + active tokens. The
// mcp_oauth_* tables are GLOBAL (no RLS), so every query uses basePrisma and the SUPER_ADMIN gate at
// the controller is the only fence; tenant filtering here is MANUAL (a `where: { tenantId }`). The
// client_secret hash is never returned. MVP registers PUBLIC clients only (PKCE; no client_secret),
// since the /token endpoint does not verify a client_secret yet.

const FIXED_GRANT_TYPES = ["authorization_code", "refresh_token"];

export interface McpClientDto {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  grantTypes: string[];
  scopes: string[];
  // true when a client_secret hash is set (confidential client); false = public (PKCE).
  isConfidential: boolean;
  // true = trusted client that skips the consent screen at /authorize.
  firstParty: boolean;
  // true = self-registered via DCR (provenance). Surfaced as an "auto-registered/unverified" badge.
  dynamicallyRegistered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toClientDto(row: {
  id: bigint;
  clientId: string;
  clientSecretHash: string | null;
  name: string;
  redirectUris: string[];
  grantTypes: string[];
  scopes: string[];
  firstParty: boolean;
  dynamicallyRegistered: boolean;
  createdAt: Date;
  updatedAt: Date;
}): McpClientDto {
  return {
    id: row.id.toString(),
    clientId: row.clientId,
    name: row.name,
    redirectUris: row.redirectUris,
    grantTypes: row.grantTypes,
    scopes: row.scopes,
    isConfidential: row.clientSecretHash !== null,
    firstParty: row.firstParty,
    dynamicallyRegistered: row.dynamicallyRegistered,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const CLIENT_SELECT = {
  id: true,
  clientId: true,
  clientSecretHash: true,
  name: true,
  redirectUris: true,
  grantTypes: true,
  scopes: true,
  firstParty: true,
  dynamicallyRegistered: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listClients(
  base: PrismaClient = basePrisma,
): Promise<McpClientDto[]> {
  const rows = await base.mcpOAuthClient.findMany({
    select: CLIENT_SELECT,
    orderBy: { id: "desc" },
  });
  return rows.map(toClientDto);
}

function sanitizeScopes(scopes: string[] | undefined): string[] {
  const allowed = new Set<string>(MCP_SCOPES);
  const out = (scopes ?? ["mcp:read"]).filter((s) => allowed.has(s));
  if (out.length === 0)
    throw new AppError("at least one valid scope is required", 400);
  return [...new Set(out)];
}

export interface CreateClientInput {
  name: string;
  redirectUris: string[];
  scopes?: string[];
  firstParty?: boolean;
}

export async function createClient(
  input: CreateClientInput,
  base: PrismaClient = basePrisma,
): Promise<McpClientDto> {
  const name = input.name.trim();
  if (!name) throw new AppError("name is required", 400);
  const reason = validateRedirectUris(input.redirectUris);
  if (reason) throw new AppError(reason, 400);
  const scopes = sanitizeScopes(input.scopes);
  const clientId = randomBytes(16).toString("hex");
  const row = await base.mcpOAuthClient.create({
    data: {
      clientId,
      // Public (PKCE) client — no client_secret in the MVP.
      clientSecretHash: null,
      name,
      redirectUris: input.redirectUris,
      grantTypes: FIXED_GRANT_TYPES,
      scopes,
      firstParty: input.firstParty ?? false,
    },
    select: CLIENT_SELECT,
  });
  return toClientDto(row);
}

export interface UpdateClientInput {
  name?: string;
  redirectUris?: string[];
  scopes?: string[];
  firstParty?: boolean;
}

export async function updateClient(
  clientId: string,
  patch: UpdateClientInput,
  base: PrismaClient = basePrisma,
): Promise<McpClientDto> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new AppError("name is required", 400);
    data.name = name;
  }
  if (patch.redirectUris !== undefined) {
    const reason = validateRedirectUris(patch.redirectUris);
    if (reason) throw new AppError(reason, 400);
    data.redirectUris = patch.redirectUris;
  }
  if (patch.scopes !== undefined) data.scopes = sanitizeScopes(patch.scopes);
  if (patch.firstParty !== undefined) data.firstParty = patch.firstParty;
  if (Object.keys(data).length === 0)
    throw new AppError("no updatable fields provided", 400);
  const res = await base.mcpOAuthClient.updateMany({
    where: { clientId },
    data,
  });
  if (res.count === 0)
    throw new NotFoundError("mcp client not found", "errors.mcpClientNotFound");
  const row = await base.mcpOAuthClient.findUnique({
    where: { clientId },
    select: CLIENT_SELECT,
  });
  if (!row)
    throw new NotFoundError("mcp client not found", "errors.mcpClientNotFound");
  return toClientDto(row);
}

// Deleting a client cascades to its tokens: revoke every access + refresh token first (a denylisted
// access jti 401s at once; revoked refresh tokens can't mint new ones), then remove the client row.
export async function deleteClient(
  clientId: string,
  base: PrismaClient = basePrisma,
): Promise<void> {
  const removed = await base.$transaction(async (tx) => {
    const now = new Date();
    await tx.mcpOAuthAccessToken.updateMany({
      where: { clientId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.mcpOAuthRefreshToken.updateMany({
      where: { clientId, revokedAt: null },
      data: { revokedAt: now },
    });
    const res = await tx.mcpOAuthClient.deleteMany({ where: { clientId } });
    return res.count;
  });
  if (removed === 0)
    throw new NotFoundError("mcp client not found", "errors.mcpClientNotFound");
}

export interface ActiveTokenDto {
  jti: string;
  clientId: string;
  clientName: string | null;
  userId: string;
  userEmail: string | null;
  tenantId: string | null;
  scopes: string[];
  expiresAt: Date;
  createdAt: Date;
}

// Lists the currently valid access tokens (not revoked, not expired), optionally fenced to one
// tenant, enriched with the client name and the user's email for a readable admin view.
export async function listActiveTokens(
  opts: { tenantId?: bigint | null } = {},
  base: PrismaClient = basePrisma,
): Promise<ActiveTokenDto[]> {
  const rows = await base.mcpOAuthAccessToken.findMany({
    where: {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(opts.tenantId != null ? { tenantId: opts.tenantId } : {}),
    },
    orderBy: { id: "desc" },
    take: 500,
  });
  if (rows.length === 0) return [];
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [clients, users] = await Promise.all([
    base.mcpOAuthClient.findMany({
      where: { clientId: { in: clientIds } },
      select: { clientId: true, name: true },
    }),
    base.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    }),
  ]);
  const clientName = new Map(clients.map((c) => [c.clientId, c.name]));
  const userEmail = new Map(users.map((u) => [u.id.toString(), u.email]));
  return rows.map((r) => ({
    jti: r.jti,
    clientId: r.clientId,
    clientName: clientName.get(r.clientId) ?? null,
    userId: r.userId.toString(),
    userEmail: userEmail.get(r.userId.toString()) ?? null,
    tenantId: r.tenantId === null ? null : r.tenantId.toString(),
    scopes: r.scopes,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

// Revokes an active access token by jti (immediate denylist) AND every non-revoked refresh token for
// the same client+user, so the client cannot simply mint a fresh access token from a live refresh.
export async function revokeToken(
  jti: string,
  base: PrismaClient = basePrisma,
): Promise<void> {
  const row = await base.mcpOAuthAccessToken.findUnique({
    where: { jti },
    select: { clientId: true, userId: true },
  });
  if (!row)
    throw new NotFoundError("mcp token not found", "errors.mcpTokenNotFound");
  await revokeAccessToken(jti, base);
  await base.mcpOAuthRefreshToken.updateMany({
    where: { clientId: row.clientId, userId: row.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export interface ClientApprovalDto {
  id: string;
  userId: string;
  userEmail: string | null;
  clientId: string;
  clientName: string | null;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Lists the remembered per-user-per-client consent approvals (what lets /authorize skip the consent
// screen), enriched with the client name and user email for a readable admin view. Revoking one
// (deleteClientApproval) makes the next /authorize prompt again.
export async function listClientApprovals(
  base: PrismaClient = basePrisma,
): Promise<ClientApprovalDto[]> {
  const rows = await base.mcpOAuthClientApproval.findMany({
    orderBy: { id: "desc" },
    take: 500,
  });
  if (rows.length === 0) return [];
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [clients, users] = await Promise.all([
    base.mcpOAuthClient.findMany({
      where: { clientId: { in: clientIds } },
      select: { clientId: true, name: true },
    }),
    base.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    }),
  ]);
  const clientName = new Map(clients.map((c) => [c.clientId, c.name]));
  const userEmail = new Map(users.map((u) => [u.id.toString(), u.email]));
  return rows.map((r) => ({
    id: r.id.toString(),
    userId: r.userId.toString(),
    userEmail: userEmail.get(r.userId.toString()) ?? null,
    clientId: r.clientId,
    clientName: clientName.get(r.clientId) ?? null,
    scopes: r.scopes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function deleteClientApproval(
  id: bigint,
  base: PrismaClient = basePrisma,
): Promise<void> {
  const res = await base.mcpOAuthClientApproval.deleteMany({ where: { id } });
  if (res.count === 0)
    throw new NotFoundError(
      "mcp approval not found",
      "errors.mcpApprovalNotFound",
    );
}
