import type { PrismaClient } from "@/../generated/prisma/client";
import logger from "@/api/lib/logger";
import basePrisma from "@/api/lib/prisma";
import config from "@/config";

// Boot-time fail-fast: the RUNTIME database connection must NOT be a superuser or a BYPASSRLS
// role, directly OR via role membership. Our whole tenant-isolation model rests on RLS, and RLS
// is silently a NO-OP for superuser/bypassrls roles — so a misconfigured runtime URL (e.g. the
// `postgres` superuser, or DATABASE_URL pointed at the migration role) would turn isolation off
// without any error. We refuse to serve in that case.
//
// FORCE ROW LEVEL SECURITY is set on every tenant table, so the table OWNER is also subject to
// policies — only superuser and bypassrls bypass. The audited cross-tenant path uses the
// `app.is_super_admin` GUC on this same non-superuser role, NOT a separate bypassrls role, so a
// single role check covers the runtime.

export class SuperuserRuntimeError extends Error {
  constructor(role: string, reasons: string[]) {
    super(
      `Runtime DB role "${role}" is privileged (${reasons.join(", ")}); RLS would be a no-op. ` +
        `Point DATABASE_URL at a NON-superuser, NON-bypassrls role (see scripts/db-bootstrap.sql). ` +
        `For local dev only, set ALLOW_SUPERUSER_RUNTIME=true.`,
    );
    this.name = "SuperuserRuntimeError";
  }
}

interface RoleRow {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  inherits_privileged: boolean;
}

export async function assertRuntimeRoleIsNotSuperuser(
  db: PrismaClient = basePrisma,
  opts: { allow?: boolean } = {},
): Promise<void> {
  const allow =
    opts.allow ?? (config.env !== "production" && config.allowSuperuserRuntime);

  // current_user's own attributes + whether it is a member (recursively) of ANY superuser or
  // bypassrls role. pg_has_role with 'USAGE' walks inherited memberships.
  const rows = await db.$queryRaw<RoleRow[]>`
    SELECT
      r.rolname,
      r.rolsuper,
      r.rolbypassrls,
      EXISTS (
        SELECT 1 FROM pg_roles m
        WHERE (m.rolsuper OR m.rolbypassrls)
          AND m.oid <> r.oid
          AND pg_has_role(r.oid, m.oid, 'USAGE')
      ) AS inherits_privileged
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;
  const row = rows[0];
  if (!row) throw new Error("could not resolve the current DB role");

  const reasons: string[] = [];
  if (row.rolsuper) reasons.push("SUPERUSER");
  if (row.rolbypassrls) reasons.push("BYPASSRLS");
  if (row.inherits_privileged) reasons.push("inherits a privileged role");
  if (reasons.length === 0) return; // safe

  if (allow) {
    logger.warn(
      { role: row.rolname, reasons },
      "Runtime DB role is privileged (RLS is a NO-OP); allowed by ALLOW_SUPERUSER_RUNTIME — never do this in production",
    );
    return;
  }
  throw new SuperuserRuntimeError(row.rolname, reasons);
}
