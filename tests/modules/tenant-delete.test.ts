import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import { encryptJson } from "@/api/lib/crypto";
import { deleteTenant } from "@/api/v1/tenants.admin.service";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenancy";
import { seedChatwootInstance } from "../utils/chatwoot";

// deleteTenant relies on the tenant_id → tenants(id) ON DELETE CASCADE FKs (tenant_fk_cascade
// migration): a single tenant.delete() wipes the whole subtree. Needs a real Postgres.
const appUrl = process.env.TEST_APP_DATABASE_URL;
const suUrl = process.env.MIGRATION_DATABASE_URL;
let dbUp = false;
let su: PrismaClient | undefined;
let app: PrismaClient | undefined;
if (appUrl && suUrl) {
  try {
    su = new PrismaClient({
      adapter: new PrismaPg({ connectionString: suUrl }),
    });
    await su.$queryRaw`SELECT 1`;
    app = new PrismaClient({
      adapter: new PrismaPg({ connectionString: appUrl }),
    });
    await app.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    dbUp = false;
  }
}
const appDb = app as PrismaClient;
const suDb = su as PrismaClient;

const superAdmin: TenantContext = {
  tenantId: null,
  userId: 1n,
  role: "SUPER_ADMIN",
};

describe.skipIf(!dbUp)("deleteTenant (cascade)", () => {
  let tenantId = 0n;
  let otherTenantId = 0n;

  beforeAll(async () => {
    const a = await suDb.tenant.create({
      data: { name: "DEL-A", slug: `del-a-${process.pid}` },
    });
    const b = await suDb.tenant.create({
      data: { name: "DEL-B", slug: `del-b-${process.pid}` },
    });
    tenantId = a.id;
    otherTenantId = b.id;
    // A multi-level subtree (deployment → instance) + a standalone row, on the tenant to delete.
    await seedChatwootInstance(suDb, {
      tenantId,
      accountId: 1,
      baseUrl: "https://del-a.example.com",
      adminToken: encryptJson("tok"),
    });
    await suDb.vaultEntry.create({
      data: {
        tenantId,
        name: "k",
        kind: "generic",
        secret: encryptJson("s"),
      },
    });
    // The OTHER tenant has its own rows that must SURVIVE the delete.
    await seedChatwootInstance(suDb, {
      tenantId: otherTenantId,
      accountId: 1,
      baseUrl: "https://del-b.example.com",
      adminToken: encryptJson("tok"),
    });
  });

  afterAll(async () => {
    for (const tid of [tenantId, otherTenantId]) {
      if (!tid) continue;
      // tenantId is already gone after the test; otherTenantId cascades on its own delete.
      await suDb.$executeRawUnsafe(`DELETE FROM tenants WHERE id = ${tid}`);
    }
    await suDb.$disconnect();
    await appDb.$disconnect();
  });

  test("deletes the tenant and cascades all its data, leaving other tenants intact", async () => {
    await deleteTenant(superAdmin, tenantId, appDb);

    // The tenant and its whole subtree are gone (cascade).
    expect(await suDb.tenant.count({ where: { id: tenantId } })).toBe(0);
    expect(await suDb.chatwootDeployment.count({ where: { tenantId } })).toBe(
      0,
    );
    expect(await suDb.chatwootInstance.count({ where: { tenantId } })).toBe(0);
    expect(await suDb.vaultEntry.count({ where: { tenantId } })).toBe(0);

    // The other tenant is untouched.
    expect(await suDb.tenant.count({ where: { id: otherTenantId } })).toBe(1);
    expect(
      await suDb.chatwootDeployment.count({
        where: { tenantId: otherTenantId },
      }),
    ).toBe(1);
  });

  test("unknown tenant id → NotFound", async () => {
    let caught: unknown;
    try {
      await deleteTenant(superAdmin, 999_999_999n, appDb);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).translationKey).toBe("errors.tenantNotFound");
  });

  test("non-super-admin is forbidden", async () => {
    await expect(
      deleteTenant(
        { tenantId: otherTenantId, userId: 1n, role: "TENANT_ADMIN" },
        otherTenantId,
        appDb,
      ),
    ).rejects.toThrow();
    // Still there (the forbidden call deleted nothing).
    expect(await suDb.tenant.count({ where: { id: otherTenantId } })).toBe(1);
  });
});
