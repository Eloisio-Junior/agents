import type {
  InboundAuthStrategy,
  Prisma,
  PrismaClient,
} from "@/../generated/prisma/client";
import basePrisma from "@/api/lib/prisma";
import { AppError, NotFoundError } from "@/lib/errors";
import { asSuperAdminOn, runScopedOn, type TenantContext } from "@/lib/tenancy";
import {
  generateRouteToken,
  hashRouteToken,
} from "@/modules/webhooks/inbound/route-token";
import { CATALOG, getCatalogEntry } from "./catalog";
import type { CatalogEntry } from "./types";

// Integration instances: the per-tenant activation of a catalog entry. Creation mints the
// opaque inbound route token (returned once); resolution maps an incoming token to the owning
// tenant + instance via a constant-time hash lookup (cross-tenant, so asSuperAdmin).

export interface ResolvedInboundRoute {
  id: bigint;
  tenantId: bigint;
  catalogType: string;
  enabled: boolean;
  inboundAuthStrategy: InboundAuthStrategy;
  inboundSecretRef: string | null;
  config: Record<string, unknown>;
}

export async function resolveInboundRouteByToken(
  token: string,
  base: PrismaClient = basePrisma,
): Promise<ResolvedInboundRoute | null> {
  const routeTokenHash = hashRouteToken(token);
  const row = await asSuperAdminOn(base, (db) =>
    db.integrationInstance.findUnique({
      where: { routeTokenHash },
      select: {
        id: true,
        tenantId: true,
        catalogType: true,
        enabled: true,
        inboundAuthStrategy: true,
        inboundSecretRef: true,
        config: true,
      },
    }),
  );
  if (!row) return null;
  return { ...row, config: (row.config ?? {}) as Record<string, unknown> };
}

export interface CreateIntegrationParams {
  catalogType: string;
  name: string;
  config?: Record<string, unknown>;
  credentialRef?: string | null;
  inboundAuthStrategy?: InboundAuthStrategy;
  inboundSecretRef?: string | null;
  enabled?: boolean;
}

// Returns the plaintext route token ONCE (never stored, never logged) for inbound-capable
// integrations; outbound-only ones (Calendar/Drive) carry no token (routeTokenHash null, no
// inbound auth). Callers surface the token to the operator who pastes it into the provider.
export async function createIntegrationInstance(
  tenantId: bigint,
  params: CreateIntegrationParams,
  base: PrismaClient = basePrisma,
): Promise<{ id: bigint; routeToken: string | null }> {
  const entry = getCatalogEntry(params.catalogType);
  if (!entry) {
    throw new AppError(`unknown catalogType: ${params.catalogType}`, 400);
  }
  // Only inbound-capable catalog entries mint a route token; the rest get no inbound surface.
  const minted = entry.supportsInbound ? generateRouteToken() : null;
  const created = await runScopedOn(
    base,
    { tenantId, userId: null, role: "TENANT_ADMIN" },
    (db) =>
      db.integrationInstance.create({
        data: {
          tenantId,
          catalogType: params.catalogType,
          name: params.name,
          enabled: params.enabled ?? true,
          config: (params.config ?? {}) as Prisma.InputJsonValue,
          credentialRef: params.credentialRef ?? null,
          inboundAuthStrategy: minted
            ? (params.inboundAuthStrategy ?? "NONE")
            : "NONE",
          inboundSecretRef: minted ? (params.inboundSecretRef ?? null) : null,
          routeTokenHash: minted?.hash ?? null,
        },
        select: { id: true },
      }),
  );
  return { id: created.id, routeToken: minted?.token ?? null };
}

// ── management (per-tenant CRUD over the REST surface) ──

export function listCatalog(): ReadonlyArray<CatalogEntry> {
  return CATALOG;
}

export interface IntegrationInstanceDto {
  id: string;
  catalogType: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  credentialRef: string | null;
  inboundAuthStrategy: InboundAuthStrategy;
  inboundSecretRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const INSTANCE_SELECT = {
  id: true,
  catalogType: true,
  name: true,
  enabled: true,
  config: true,
  credentialRef: true,
  inboundAuthStrategy: true,
  inboundSecretRef: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toInstanceDto(r: {
  id: bigint;
  catalogType: string;
  name: string;
  enabled: boolean;
  config: unknown;
  credentialRef: string | null;
  inboundAuthStrategy: InboundAuthStrategy;
  inboundSecretRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}): IntegrationInstanceDto {
  return {
    id: String(r.id),
    catalogType: r.catalogType,
    name: r.name,
    enabled: r.enabled,
    config: (r.config ?? {}) as Record<string, unknown>,
    credentialRef: r.credentialRef,
    inboundAuthStrategy: r.inboundAuthStrategy,
    inboundSecretRef: r.inboundSecretRef,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function listIntegrationInstances(
  ctx: TenantContext,
  base: PrismaClient = basePrisma,
): Promise<IntegrationInstanceDto[]> {
  const rows = await runScopedOn(base, ctx, (db) =>
    db.integrationInstance.findMany({
      select: INSTANCE_SELECT,
      orderBy: { name: "asc" },
    }),
  );
  return rows.map(toInstanceDto);
}

export async function getIntegrationInstance(
  ctx: TenantContext,
  id: bigint,
  base: PrismaClient = basePrisma,
): Promise<IntegrationInstanceDto> {
  const row = await runScopedOn(base, ctx, (db) =>
    db.integrationInstance.findUnique({
      where: { id },
      select: INSTANCE_SELECT,
    }),
  );
  if (!row) {
    throw new NotFoundError(
      "integration instance not found",
      "errors.integrationInstanceNotFound",
    );
  }
  return toInstanceDto(row);
}

export interface UpdateIntegrationParams {
  name?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  credentialRef?: string | null;
  inboundAuthStrategy?: InboundAuthStrategy;
  inboundSecretRef?: string | null;
}

export async function updateIntegrationInstance(
  ctx: TenantContext,
  id: bigint,
  params: UpdateIntegrationParams,
  base: PrismaClient = basePrisma,
): Promise<IntegrationInstanceDto> {
  return runScopedOn(base, ctx, async (db) => {
    const current = await db.integrationInstance.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundError(
        "integration instance not found",
        "errors.integrationInstanceNotFound",
      );
    }
    await db.integrationInstance.update({
      where: { id },
      data: {
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
        ...(params.config !== undefined
          ? { config: params.config as Prisma.InputJsonValue }
          : {}),
        ...(params.credentialRef !== undefined
          ? { credentialRef: params.credentialRef ?? null }
          : {}),
        ...(params.inboundAuthStrategy !== undefined
          ? { inboundAuthStrategy: params.inboundAuthStrategy }
          : {}),
        ...(params.inboundSecretRef !== undefined
          ? { inboundSecretRef: params.inboundSecretRef ?? null }
          : {}),
      },
    });
    const row = await db.integrationInstance.findUniqueOrThrow({
      where: { id },
      select: INSTANCE_SELECT,
    });
    return toInstanceDto(row);
  });
}

export async function deleteIntegrationInstance(
  ctx: TenantContext,
  id: bigint,
  base: PrismaClient = basePrisma,
): Promise<void> {
  await runScopedOn(base, ctx, async (db) => {
    const res = await db.integrationInstance.deleteMany({ where: { id } });
    if (res.count === 0) {
      throw new NotFoundError(
        "integration instance not found",
        "errors.integrationInstanceNotFound",
      );
    }
  });
}
