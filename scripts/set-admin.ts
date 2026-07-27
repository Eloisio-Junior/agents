#!/usr/bin/env bun

import { PrismaPg } from "@prisma/adapter-pg";
import { roleAtLeast } from "@/lib/roles";
import { PrismaClient, type UserRole } from "../generated/prisma/client";

export interface ExistingUserUpdatePlan {
  // Present only when a promotion is actually needed (user.role below target). Role and
  // tenantId are always set TOGETHER — the users_role_tenant_check constraint requires
  // TENANT_ADMIN/AGENT to carry a non-null tenantId and SUPER_ADMIN to carry null, so
  // touching one without the other can violate it (e.g. downgrading role while leaving a
  // stale null/non-null tenantId).
  promotion?: { role: UserRole; tenantId: bigint | null };
  passwordHash?: string;
  message: string;
}

// Pure decision logic for updating an EXISTING user (no DB/hashing I/O), so the "never
// silently demote, never split role from tenantId" rule is unit-testable. Setting a password
// must NOT force a role change: a SUPER_ADMIN given a password used to get unconditionally
// reset to the computed TENANT_ADMIN role without its tenantId, tripping the DB check
// constraint. Promotion only happens when the user's current role ranks below the target.
export function planExistingUserUpdate(params: {
  email: string;
  currentRole: UserRole;
  targetRole: UserRole;
  targetTenantId: bigint | null;
  targetRoleLabel: string;
  passwordHash?: string;
}): ExistingUserUpdatePlan {
  const { email, currentRole, targetRole, targetTenantId, targetRoleLabel } =
    params;
  const needsPromotion = !roleAtLeast(currentRole, targetRole);
  const promotion = needsPromotion
    ? { role: targetRole, tenantId: targetTenantId }
    : undefined;

  if (!needsPromotion && !params.passwordHash) {
    return {
      message: `User ${email} is already at or above ${targetRole} (${currentRole}).`,
    };
  }

  const message =
    needsPromotion && params.passwordHash
      ? `User ${email} set as ${targetRoleLabel} with new password.`
      : needsPromotion
        ? `Successfully set ${email} as ${targetRoleLabel}.`
        : `Password updated for ${email} (role unchanged: ${currentRole}).`;

  return { promotion, passwordHash: params.passwordHash, message };
}

async function main() {
  const email = process.argv[2];
  const passwordArg = process.argv[3];

  if (!email) {
    console.error("Usage: bun scripts/set-admin.ts <email> [password]");
    process.exit(1);
  }

  // NOTE: admin CLI connects via the migration/superuser URL so it can read the tenants
  // table and write users without RLS friction (it writes outside the /setup advisory lock).
  // Run via Bun, which expands ${POSTGRES_PORT} in .env at load time.
  const databaseUrl =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "MIGRATION_DATABASE_URL or DATABASE_URL environment variable is required",
    );
    process.exit(1);
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    // NOTE: TENANT_ADMIN of the first tenant when one exists; SUPER_ADMIN (tenant_id NULL)
    // otherwise, so this can also bootstrap a fleet admin before /setup has run.
    const tenant = await prisma.tenant.findFirst({
      orderBy: { id: "asc" },
      select: { id: true },
    });
    const role: UserRole = tenant ? "TENANT_ADMIN" : "SUPER_ADMIN";
    const tenantId = tenant?.id ?? null;
    const roleLabel = `${role}${tenant ? ` (tenant ${tenant.id})` : ""}`;

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (!user) {
      const password =
        passwordArg ??
        crypto.randomUUID().replace(/-/g, "") +
          crypto.randomUUID().replace(/-/g, "").toUpperCase();
      const passwordHash = await Bun.password.hash(password, {
        algorithm: "bcrypt",
        cost: 10,
      });

      await prisma.user.create({
        data: { email, passwordHash, role, tenantId },
      });

      console.log(`User created and set as ${roleLabel}.`);
      console.log(`Email:    ${email}`);
      if (!passwordArg) console.log(`Password: ${password}`);
      return;
    }

    const passwordHash = passwordArg
      ? await Bun.password.hash(passwordArg, { algorithm: "bcrypt", cost: 10 })
      : undefined;

    const plan = planExistingUserUpdate({
      email,
      currentRole: user.role,
      targetRole: role,
      targetTenantId: tenantId,
      targetRoleLabel: roleLabel,
      passwordHash,
    });

    if (plan.promotion || plan.passwordHash) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(plan.promotion ?? {}),
          ...(plan.passwordHash ? { passwordHash: plan.passwordHash } : {}),
        },
      });
    }

    console.log(plan.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
}
