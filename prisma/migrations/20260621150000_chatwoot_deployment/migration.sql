-- Split the Chatwoot connection into a DEPLOYMENT (one base URL + one admin/user token, registered
-- once per tenant) and its ACCOUNTS (the existing chatwoot_instances rows). The admin token moves to
-- the parent so the operator enters it a single time and every account reuses it. The 5 FK tables
-- that reference chatwoot_instances(id) are untouched — only base_url/admin_token move up a level.
--
-- Data migration: for each tenant, create ONE deployment from its canonical account (the most recent
-- ACTIVE one; falls back to the most recent of any), then reparent every account to it. Accounts whose
-- base_url diverged (legacy multi-deployment seeds) become ghost accounts of the canonical deployment;
-- their conversations link by account id, not base_url, so history stays intact. Pre-production: no
-- back-compat path. The "one tenant = one Chatwoot deployment" rule is enforced structurally by the
-- UNIQUE tenant_id below + the app's connect-time guard.

-- CreateTable
CREATE TABLE "chatwoot_deployments" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "base_url" TEXT NOT NULL,
    "admin_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_deployments_tenant_id_key" ON "chatwoot_deployments"("tenant_id");

-- Backfill one deployment per tenant from its canonical account (active first, then most recent).
INSERT INTO "chatwoot_deployments" ("tenant_id", "base_url", "admin_token", "created_at", "updated_at")
SELECT DISTINCT ON ("tenant_id")
    "tenant_id", "base_url", "admin_token", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "chatwoot_instances"
ORDER BY "tenant_id", ("disconnected_at" IS NULL) DESC, "id" DESC;

-- RLS: same tenant_isolation policy as every other tenant-scoped table.
ALTER TABLE "chatwoot_deployments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chatwoot_deployments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chatwoot_deployments"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );

-- Reparent accounts: add the FK column nullable, backfill from the per-tenant deployment, then enforce.
ALTER TABLE "chatwoot_instances" ADD COLUMN "deployment_id" BIGINT;
UPDATE "chatwoot_instances" i
  SET "deployment_id" = d."id"
  FROM "chatwoot_deployments" d
  WHERE d."tenant_id" = i."tenant_id";
ALTER TABLE "chatwoot_instances" ALTER COLUMN "deployment_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "chatwoot_instances_deployment_id_idx" ON "chatwoot_instances"("deployment_id");

-- AddForeignKey
ALTER TABLE "chatwoot_instances" ADD CONSTRAINT "chatwoot_instances_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "chatwoot_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The base URL + admin token now live on the parent deployment.
ALTER TABLE "chatwoot_instances" DROP COLUMN "base_url", DROP COLUMN "admin_token";
