import { afterAll, describe, expect, test } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import type { VerifiedToken } from "@/modules/mcp/oauth/tokens";
import { tenantCreate, tenantGet, tenantList } from "@/modules/mcp/write-fleet";

// Fleet/admin write tools: the admin gate (mcp:admin + SUPER_ADMIN role) is DB-free; cross-tenant
// create/list/get need a real Postgres (skipIf). These run as the audited asSuperAdmin path.

function superAdmin(over: Partial<VerifiedToken> = {}): VerifiedToken {
  return {
    userId: 1n,
    tenantId: null,
    role: "SUPER_ADMIN",
    scopes: ["mcp:read", "mcp:write", "mcp:admin"],
    clientId: "c",
    jti: "j",
    ...over,
  };
}

describe("MCP fleet gate (no DB)", () => {
  test("tenant_list without mcp:admin → insufficient_scope", async () => {
    const r = await tenantList(
      superAdmin({ scopes: ["mcp:read", "mcp:write"] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("insufficient_scope");
  });

  test("tenant_create with mcp:admin but non-SUPER_ADMIN → forbidden", async () => {
    const r = await tenantCreate(
      superAdmin({ role: "TENANT_ADMIN", tenantId: 1n }),
      { name: "x", slug: "x" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("forbidden");
  });
});

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

describe.skipIf(!dbUp)("MCP fleet tools (DB)", () => {
  const slug = `fleet-${process.pid}`;
  let createdId = 0n;

  afterAll(async () => {
    if (createdId) {
      await suDb.$executeRawUnsafe(
        `DELETE FROM audit_logs WHERE target = 'tenant:${createdId}'`,
      );
      await suDb.$executeRawUnsafe(
        `DELETE FROM tenants WHERE id = ${createdId}`,
      );
    }
    await suDb.$disconnect();
    await appDb.$disconnect();
  });

  test("tenant_create dry-run creates nothing; apply provisions + audits", async () => {
    const p = superAdmin();
    const dry = await tenantCreate(
      p,
      { name: "Fleet Co", slug },
      { base: appDb },
    );
    expect(dry.ok).toBe(true);
    if (dry.ok) expect(dry.data.dryRun).toBe(true);
    expect(await suDb.tenant.count({ where: { slug } })).toBe(0);

    const applied = await tenantCreate(
      p,
      { name: "Fleet Co", slug, dry_run: false },
      { base: appDb },
    );
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const tenant = applied.data.tenant as { id: string };
      createdId = BigInt(tenant.id);
    }
    expect(await suDb.tenant.count({ where: { slug } })).toBe(1);
    const audits = await suDb.auditLog.count({
      where: { action: "mcp.tenant_create", target: `tenant:${createdId}` },
    });
    expect(audits).toBe(1);
  });

  test("tenant_list (cross-tenant) includes the new tenant", async () => {
    const r = await tenantList(superAdmin(), { base: appDb });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const tenants = r.data.tenants as { id: string; slug: string }[];
      expect(tenants.find((t) => t.slug === slug)).toBeDefined();
    }
  });

  test("tenant_get returns any tenant by id", async () => {
    const r = await tenantGet(
      superAdmin(),
      { tenant_id: String(createdId) },
      { base: appDb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const tenant = r.data.tenant as { slug: string };
      expect(tenant.slug).toBe(slug);
    }
  });

  test("tenant_get invalid id → error", async () => {
    const r = await tenantGet(
      superAdmin(),
      { tenant_id: "nope" },
      { base: appDb },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("invalid tenant_id");
  });
});
