// TenancyProvider — the single boundary that turns a TenantContext into tenant-scoped
// database access. Hybrid isolation: Prisma `$extends` (closure-bound tenant_id on
// write) + Postgres RLS (the hard guarantee). See docs/tenancy.md.

import type { UserRole } from "@/../generated/prisma/client";
import { ForbiddenError } from "@/lib/errors";
import type { TenantContext } from "./context";

// NOTE: re-exported so `@/lib/tenancy` stays the one server-side entry point; the rank
// itself lives in the pure `@/lib/roles` shared with the client and CLI.
export { isAdminRole, roleAtLeast } from "@/lib/roles";
export type { ScopedDb, TenantContext } from "./context";
export {
  getTenantContext,
  requireTenantContext,
  runWithTenantContext,
} from "./context";
export {
  asSuperAdmin,
  asSuperAdminOn,
  runScoped,
  runScopedOn,
} from "./multi-tenant";

// NOTE: fail-closed cross-tenant gate. SUPER_ADMIN may target any tenant (the actual
// data access still goes through asSuperAdmin, which is audited). Everyone else may only
// touch their own tenant; a mismatch or missing target is Forbidden.
export function authorize(
  ctx: TenantContext,
  targetTenantId: bigint | null,
): void {
  if (ctx.role === "SUPER_ADMIN") return;
  if (targetTenantId === null || targetTenantId !== ctx.tenantId) {
    throw new ForbiddenError();
  }
}

// NOTE: pure request-context resolution (unit-tested without Elysia). X-Tenant-Id is a
// control-plane header: honored ONLY for SUPER_ADMIN (who has no home tenant and selects
// a target per request). For everyone else it is forgeable and ignored — a mismatching
// value is flagged as an anomaly to log, never silently accepted. A malformed selector
// for a super admin yields a null target (→ TenantTargetRequiredError at use, i.e. 400).
export function resolveRequestTenantContext(
  user: { id: bigint; tenantId: bigint | null; role: UserRole } | null,
  headerTenantId: string | undefined,
): { context: TenantContext | null; anomaly: boolean } {
  if (!user) return { context: null, anomaly: false };

  if (user.role === "SUPER_ADMIN") {
    let target: bigint | null = null;
    if (headerTenantId) {
      try {
        target = BigInt(headerTenantId);
      } catch {
        target = null;
      }
    }
    return {
      context: { tenantId: target, userId: user.id, role: user.role },
      anomaly: false,
    };
  }

  const anomaly =
    headerTenantId !== undefined &&
    headerTenantId !== String(user.tenantId ?? "");
  return {
    context: { tenantId: user.tenantId, userId: user.id, role: user.role },
    anomaly,
  };
}
