import type { PrismaClient } from "@/../generated/prisma/client";
import { normalizeChatwootBaseUrl } from "@/modules/chatwoot/management";

export interface SeedChatwootInstanceArgs {
  tenantId: bigint;
  accountId: number;
  // baseUrl + adminToken now live on the parent ChatwootDeployment. Stored as-is: tests pass either a
  // raw marker ("enc") or a real encryptJson(...) blob, depending on whether they decrypt it.
  baseUrl?: string;
  adminToken?: string;
  accountName?: string | null;
  disconnectedAt?: Date | null;
  id?: bigint;
}

// Seed a Chatwoot account (ChatwootInstance) for a tenant in tests, auto-provisioning the parent
// ChatwootDeployment (one per tenant: base URL + shared token). Reuses the deployment when the tenant
// already has one (tenant_id is UNIQUE), mirroring the production "one deployment, N accounts" model.
// Returns the created instance row. Pass the same db handle the test uses (super-admin or scoped).
export async function seedChatwootInstance(
  db: PrismaClient,
  args: SeedChatwootInstanceArgs,
) {
  const baseUrl = args.baseUrl ?? "https://chat.test.local";
  const adminToken = args.adminToken ?? "enc";
  const deployment = await db.chatwootDeployment.upsert({
    where: { tenantId: args.tenantId },
    create: { tenantId: args.tenantId, baseUrl, adminToken },
    update: {},
    select: { id: true },
  });
  return db.chatwootInstance.create({
    data: {
      ...(args.id !== undefined ? { id: args.id } : {}),
      tenantId: args.tenantId,
      deploymentId: deployment.id,
      accountId: args.accountId,
      serverKey: normalizeChatwootBaseUrl(baseUrl),
      accountName: args.accountName ?? null,
      disconnectedAt: args.disconnectedAt ?? null,
    },
  });
}
