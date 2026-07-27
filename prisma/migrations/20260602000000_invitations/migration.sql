-- CreateTable: tenant-scoped user invitations. GLOBAL table (NO row-level security) like `users`:
-- acceptInvite resolves it by token hash with no tenant context (public endpoint), so RLS would
-- fail-closed. Isolation is enforced explicitly in the service layer (tenantScope), the same way
-- admin.service scopes the global `users` table. Grants to the runtime role come from
-- ALTER DEFAULT PRIVILEGES (scripts/db-bootstrap.sql), since this migration runs as the owner role.
CREATE TABLE "invitations" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" BIGINT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: O(1) lookup by hash at accept time (no linear scan, no timing oracle).
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex: one live invite per (tenant, email) — re-inviting rotates via upsert.
CREATE UNIQUE INDEX "invitations_tenant_id_email_key" ON "invitations"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_created_at_idx" ON "invitations"("tenant_id", "created_at");

-- An invitation can never mint a SUPER_ADMIN (fleet-level; only via /setup or `bun set-admin`).
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_not_superadmin_check"
  CHECK ("role" <> 'SUPER_ADMIN');
