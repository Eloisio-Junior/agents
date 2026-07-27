-- Vault uniqueness: (tenant_id, name) → (tenant_id, name, kind).
-- Two credentials may share the same name if their kind differs; 409 conflict
-- only fires when both name AND kind match.
--
-- Steps:
--   1. Backfill NULL kind to 'generic' before setting NOT NULL.
--   2. Set the NOT NULL default on the column.
--   3. Drop the old (tenant_id, name) unique constraint.
--   4. Create the new (tenant_id, name, kind) unique constraint.

UPDATE "vault_entries" SET "kind" = 'generic' WHERE "kind" IS NULL;

ALTER TABLE "vault_entries" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "vault_entries" ALTER COLUMN "kind" SET DEFAULT 'generic';

DROP INDEX IF EXISTS "vault_entries_tenant_id_name_key";

CREATE UNIQUE INDEX "vault_entries_tenant_id_name_kind_key" ON "vault_entries"("tenant_id", "name", "kind");
