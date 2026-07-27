import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import { encryptJson } from "@/api/lib/crypto";
import type { TenantContext } from "@/lib/tenancy";
import { getLangfuseCosts } from "@/modules/analytics/langfuse-costs";
import { updateLangfuse } from "@/modules/tenant-settings/service";
import { formatVaultRef } from "@/modules/vault/service";

// Helper: minimal fake fetch that returns sequential JSON bodies.
function makeFetch(responses: unknown[]): typeof fetch {
  let callIndex = 0;
  return (async () => {
    const body = responses[callIndex++] ?? { data: [] };
    return {
      ok: true,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new Error("network error");
  }) as unknown as typeof fetch;
}

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

let tenantId = 0n;

function ctx(): TenantContext {
  return { tenantId, userId: null, role: "TENANT_ADMIN" };
}

describe.skipIf(!dbUp)("getLangfuseCosts (DB)", () => {
  beforeAll(async () => {
    const t = await suDb.tenant.create({
      data: { name: "CostTest", slug: `cost-${process.pid}` },
    });
    tenantId = t.id;
    const entry = await suDb.vaultEntry.create({
      data: {
        tenantId,
        name: "lf-cost",
        kind: "langfuse",
        secret: encryptJson({ publicKey: "pk-test", secretKey: "sk-test" }),
        baseUrl: "https://cloud.langfuse.com",
      },
      select: { id: true },
    });
    await updateLangfuse(
      ctx(),
      { enabled: true, credentialRef: formatVaultRef(entry.id) },
      appDb,
    );
  });

  afterAll(async () => {
    if (tenantId) {
      await suDb.$executeRawUnsafe(
        `DELETE FROM vault_entries WHERE tenant_id = ${tenantId}`,
      );
      await suDb.$executeRawUnsafe(
        `DELETE FROM tenants WHERE id = ${tenantId}`,
      );
    }
    await suDb.$disconnect();
    await appDb.$disconnect();
  });

  test("ok: parses daily series + byModel, string sum_totalCost", async () => {
    const dailyData = [
      { time_dimension: "2026-06-01T00:00:00Z", sum_totalCost: "0.5" },
      { time_dimension: "2026-06-02T00:00:00Z", sum_totalCost: "1.25" },
    ];
    const modelData = [
      { providedModelName: "gpt-4o", sum_totalCost: "1.0" },
      { providedModelName: "gpt-4o-mini", sum_totalCost: "0.75" },
      { providedModelName: null, sum_totalCost: "0" },
    ];
    const result = await getLangfuseCosts(
      ctx(),
      {},
      appDb,
      makeFetch([{ data: dailyData }, { data: modelData }]),
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.totalCostUsd).toBeCloseTo(1.75, 6);
    expect(result.days).toHaveLength(2);
    expect(result.days[0]).toEqual({ date: "2026-06-01", costUsd: 0.5 });
    expect(result.days[1]).toEqual({ date: "2026-06-02", costUsd: 1.25 });
    // byModel sorted by cost desc; null model becomes "unknown"
    expect(result.byModel[0]).toEqual({ model: "gpt-4o", costUsd: 1.0 });
    expect(result.byModel[1]).toEqual({ model: "gpt-4o-mini", costUsd: 0.75 });
    expect(result.byModel[2]).toEqual({ model: "unknown", costUsd: 0 });
  });

  test("error: fetch failure → { status: 'error' }", async () => {
    const result = await getLangfuseCosts(ctx(), {}, appDb, failingFetch());
    expect(result.status).toBe("error");
  });

  test("disabled: tenant without Langfuse config → { status: 'disabled' }", async () => {
    const t2 = await suDb.tenant.create({
      data: { name: "NoCost", slug: `no-cost-${process.pid}` },
    });
    const noCtx: TenantContext = {
      tenantId: t2.id,
      userId: null,
      role: "TENANT_ADMIN",
    };
    try {
      const result = await getLangfuseCosts(noCtx, {}, appDb);
      expect(result.status).toBe("disabled");
    } finally {
      await suDb.$executeRawUnsafe(`DELETE FROM tenants WHERE id = ${t2.id}`);
    }
  });
});
