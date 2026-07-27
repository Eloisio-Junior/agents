import type { PrismaClient } from "@/../generated/prisma/client";
import { ProEditionError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenancy";
import type { TenantCreate, TenantDto, TenantUpdate } from "./tenants.service";

// Tenant mutation stub: create/update/delete require the Pro edition and refuse with a 403 that the
// client turns into an upgrade prompt. The single tenant is created at /setup.

export async function updateTenant(
  _ctx: TenantContext,
  _id: bigint,
  _patch: TenantUpdate,
  _base?: PrismaClient,
): Promise<TenantDto> {
  throw new ProEditionError();
}

export async function createTenant(
  _ctx: TenantContext,
  _input: TenantCreate,
  _base?: PrismaClient,
): Promise<TenantDto> {
  throw new ProEditionError();
}

export async function deleteTenant(
  _ctx: TenantContext,
  _id: bigint,
  _base?: PrismaClient,
): Promise<void> {
  throw new ProEditionError();
}
