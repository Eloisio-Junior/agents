-- Vault entries gain a lifecycle status. Existing rows are real, filled credentials → "active".
-- A "pending" entry is a reference created without a secret (e.g. via the MCP `credential_create`
-- tool): it stores encryptJson({}) as a placeholder and resolves as "missing" until the operator
-- fills it in the UI, at which point updateVaultEntry promotes it back to "active". Additive: new
-- NOT NULL column with a default, no RLS or index change (status is always filtered within a tenant
-- that is already indexed by tenant_id).
ALTER TABLE "vault_entries" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
