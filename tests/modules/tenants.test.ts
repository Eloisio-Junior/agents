import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import { updateTenant } from "@/api/v1/tenants.admin.service";
import { getTenant } from "@/api/v1/tenants.service";
import { sanitizeBranding } from "@/lib/branding";
import type { TenantContext } from "@/lib/tenancy";

describe("sanitizeBranding (server-side)", () => {
  test("keeps allowlisted keys with valid color tokens", () => {
    expect(
      sanitizeBranding({ accent: "#ff0000", primary: "oklch(0.6 0.2 20)" }),
    ).toEqual({ accent: "#ff0000", primary: "oklch(0.6 0.2 20)" });
  });
  test("drops unknown keys and invalid values (anti-injection)", () => {
    expect(
      sanitizeBranding({
        accent: "url(evil)",
        bgPrimary: "#000000",
        accentSoft: "#0f0",
      }),
    ).toEqual({ accentSoft: "#0f0" });
  });
});

// ── DB-gated: scoped tenant update ──
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
const suDb = su as PrismaClient;
const appDb = app as PrismaClient;

let tenantA = 0n;
let tenantB = 0n;
function ctx(t: bigint): TenantContext {
  return { tenantId: t, userId: null, role: "TENANT_ADMIN" };
}

describe.skipIf(!dbUp)("updateTenant (scoped)", () => {
  beforeAll(async () => {
    const a = await suDb.tenant.create({
      data: { name: "TenA", slug: `ten-a-${process.pid}` },
    });
    tenantA = a.id;
    const b = await suDb.tenant.create({
      data: { name: "TenB", slug: `ten-b-${process.pid}` },
    });
    tenantB = b.id;
  });

  afterAll(async () => {
    for (const tid of [tenantA, tenantB]) {
      if (tid)
        await suDb.$executeRawUnsafe(`DELETE FROM tenants WHERE id = ${tid}`);
    }
    await suDb.$disconnect();
    await appDb.$disconnect();
  });

  test("updates name on write", async () => {
    const updated = await updateTenant(
      ctx(tenantA),
      tenantA,
      { name: "Acme" },
      appDb,
    );
    expect(updated.name).toBe("Acme");
  });

  test("a tenant cannot update another tenant's row (RLS → NotFound)", async () => {
    expect(
      updateTenant(ctx(tenantB), tenantA, { name: "Hijack" }, appDb),
    ).rejects.toThrow();
    const a = await getTenant(ctx(tenantA), tenantA, appDb);
    expect(a.name).toBe("Acme"); // untouched by B's attempt
  });
});
