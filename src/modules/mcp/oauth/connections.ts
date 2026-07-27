import type { PrismaClient } from "@/../generated/prisma/client";
import basePrisma from "@/api/lib/prisma";

// Self-service view of a user's OWN MCP connections (the apps they approved via OAuth) and the
// ability to disconnect them. The mcp_oauth_* tables are GLOBAL (no RLS), so every query runs on the
// base client and is fenced MANUALLY by userId — a user can only ever see or affect their own rows.
// Admin-wide management (every user, every client) lives in oauth/admin.ts (SUPER_ADMIN-only, Full);
// this surface is available to every authenticated role.

export interface MyConnectionDto {
  clientId: string;
  clientName: string;
  scopes: string[];
  // true = trusted client promoted by an admin (skips the consent screen).
  firstParty: boolean;
  // true = self-registered via DCR and not promoted to trusted → shown as "unverified" in the UI.
  unverified: boolean;
  // count of the caller's live (not revoked, not expired) access tokens for this client.
  activeTokenCount: number;
  connectedAt: Date;
  updatedAt: Date;
}

// Lists the caller's remembered approvals (one per connected app), enriched with the client name,
// trust/provenance flags and a live-token count. Ordered newest first.
export async function listMyConnections(
  userId: bigint,
  base: PrismaClient = basePrisma,
): Promise<MyConnectionDto[]> {
  const approvals = await base.mcpOAuthClientApproval.findMany({
    where: { userId },
    orderBy: { id: "desc" },
  });
  if (approvals.length === 0) return [];
  const clientIds = [...new Set(approvals.map((a) => a.clientId))];
  const [clients, activeTokens] = await Promise.all([
    base.mcpOAuthClient.findMany({
      where: { clientId: { in: clientIds } },
      select: {
        clientId: true,
        name: true,
        firstParty: true,
        dynamicallyRegistered: true,
      },
    }),
    base.mcpOAuthAccessToken.findMany({
      where: {
        userId,
        clientId: { in: clientIds },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { clientId: true },
    }),
  ]);
  const byClient = new Map(clients.map((c) => [c.clientId, c]));
  const activeCount = new Map<string, number>();
  for (const tk of activeTokens) {
    activeCount.set(tk.clientId, (activeCount.get(tk.clientId) ?? 0) + 1);
  }
  return approvals.map((a) => {
    const c = byClient.get(a.clientId);
    const firstParty = c?.firstParty ?? false;
    return {
      clientId: a.clientId,
      clientName: c?.name ?? a.clientId,
      scopes: a.scopes,
      firstParty,
      unverified: (c?.dynamicallyRegistered ?? false) && !firstParty,
      activeTokenCount: activeCount.get(a.clientId) ?? 0,
      connectedAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });
}

export interface DisconnectResult {
  removedApproval: boolean;
  revokedAccessTokens: number;
  revokedRefreshTokens: number;
}

// Disconnects an app for THIS user: forgets the remembered approval (so the next /authorize prompts
// again) AND revokes the user's live access + refresh tokens for that client (so existing sessions
// die now, not only future consent). Idempotent and strictly userId-scoped — calling it for a client
// another user connected has no effect on that user.
export async function disconnectClient(
  userId: bigint,
  clientId: string,
  base: PrismaClient = basePrisma,
): Promise<DisconnectResult> {
  const now = new Date();
  const [approval, access, refresh] = await base.$transaction([
    base.mcpOAuthClientApproval.deleteMany({ where: { userId, clientId } }),
    base.mcpOAuthAccessToken.updateMany({
      where: { userId, clientId, revokedAt: null },
      data: { revokedAt: now },
    }),
    base.mcpOAuthRefreshToken.updateMany({
      where: { userId, clientId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return {
    removedApproval: approval.count > 0,
    revokedAccessTokens: access.count,
    revokedRefreshTokens: refresh.count,
  };
}
