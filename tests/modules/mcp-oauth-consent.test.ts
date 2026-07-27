import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/../generated/prisma/client";
import {
  consumePendingAuthorization,
  createPendingAuthorization,
  findApproval,
  getPendingAuthorization,
  isApprovalSufficient,
  issueConsentCsrf,
  upsertApproval,
} from "@/modules/mcp/oauth/consent";

const suUrl = process.env.MIGRATION_DATABASE_URL;
let dbUp = false;
let su: PrismaClient | undefined;
if (suUrl) {
  try {
    su = new PrismaClient({
      adapter: new PrismaPg({ connectionString: suUrl }),
    });
    await su.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    dbUp = false;
  }
}
const suDb = su as PrismaClient;

const CLIENT = `consent-${process.pid}`;
const REDIRECT = "https://client.example/cb";
let tenantId = 0n;
let userId = 0n;
const OTHER_USER = 999_999_999n;

async function mintPending(): Promise<string> {
  const { requestId } = await createPendingAuthorization({
    clientId: CLIENT,
    userId,
    tenantId,
    redirectUri: REDIRECT,
    scopes: ["mcp:read", "mcp:write"],
    codeChallenge: randomBytes(16).toString("base64url"),
    codeChallengeMethod: "S256",
    state: "xyz",
    base: suDb,
  });
  return requestId;
}

describe.skipIf(!dbUp)("mcp oauth consent (pending + approvals)", () => {
  beforeAll(async () => {
    const t = await suDb.tenant.create({
      data: { name: "ConsentT", slug: `consent-${process.pid}` },
    });
    tenantId = t.id;
    const u = await suDb.user.create({
      data: {
        tenantId,
        email: `consent-${process.pid}@example.com`,
        role: "TENANT_ADMIN",
        passwordHash: "x",
      },
    });
    userId = u.id;
  });

  afterAll(async () => {
    await suDb.$executeRawUnsafe(
      `DELETE FROM mcp_oauth_pending_authorizations WHERE client_id = '${CLIENT}'`,
    );
    await suDb.$executeRawUnsafe(
      `DELETE FROM mcp_oauth_client_approvals WHERE client_id = '${CLIENT}'`,
    );
    if (userId)
      await suDb.$executeRawUnsafe(`DELETE FROM users WHERE id = ${userId}`);
    if (tenantId)
      await suDb.$executeRawUnsafe(
        `DELETE FROM tenants WHERE id = ${tenantId}`,
      );
    await suDb.$disconnect();
  });

  test("create → get returns the (unconsumed) pending for its owner", async () => {
    const req = await mintPending();
    const row = await getPendingAuthorization(req, userId, suDb);
    expect(row).not.toBeNull();
    expect(row?.clientId).toBe(CLIENT);
    expect(row?.scopes).toEqual(["mcp:read", "mcp:write"]);
    expect(row?.consumedAt).toBeNull();
  });

  test("get is bound to the owner (a different user sees nothing)", async () => {
    const req = await mintPending();
    expect(await getPendingAuthorization(req, OTHER_USER, suDb)).toBeNull();
  });

  test("expired pending is not returned", async () => {
    const req = await mintPending();
    await suDb.mcpOAuthPendingAuthorization.updateMany({
      where: { clientId: CLIENT, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getPendingAuthorization(req, userId, suDb)).toBeNull();
    // restore future expiry for subsequent tests' freshly-minted rows is unnecessary (each mints new)
  });

  test("issue CSRF then consume with it yields the row exactly once", async () => {
    const req = await mintPending();
    const csrf = await issueConsentCsrf(req, userId, suDb);
    expect(csrf).toBeTruthy();
    const row = await consumePendingAuthorization(
      req,
      userId,
      csrf as string,
      suDb,
    );
    expect(row?.clientId).toBe(CLIENT);
    // single-use: a replay sees a consumed record → null
    expect(
      await consumePendingAuthorization(req, userId, csrf as string, suDb),
    ).toBeNull();
  });

  test("consume with a wrong CSRF token is rejected", async () => {
    const req = await mintPending();
    await issueConsentCsrf(req, userId, suDb);
    expect(
      await consumePendingAuthorization(req, userId, "not-the-token", suDb),
    ).toBeNull();
  });

  test("consume without issuing a CSRF token is rejected", async () => {
    const req = await mintPending();
    expect(
      await consumePendingAuthorization(req, userId, "anything", suDb),
    ).toBeNull();
  });

  test("approval is scope-aware (subset passes, escalation fails)", () => {
    expect(isApprovalSufficient(["mcp:read", "mcp:write"], ["mcp:read"])).toBe(
      true,
    );
    expect(isApprovalSufficient(["mcp:read"], ["mcp:read", "mcp:write"])).toBe(
      false,
    );
  });

  test("upsert remembers and widens the approval (stores the union)", async () => {
    await upsertApproval(userId, CLIENT, ["mcp:read"], suDb);
    let approval = await findApproval(userId, CLIENT, suDb);
    expect(approval?.scopes).toEqual(["mcp:read"]);

    await upsertApproval(userId, CLIENT, ["mcp:write"], suDb);
    approval = await findApproval(userId, CLIENT, suDb);
    expect(new Set(approval?.scopes)).toEqual(
      new Set(["mcp:read", "mcp:write"]),
    );
  });
});
