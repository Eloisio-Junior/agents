-- A Chatwoot ACCOUNT (server + accountId) belongs to a single tenant across the fleet, while a
-- server (base URL) may back many tenants. We denormalize the normalized base URL onto the instance
-- as "server_key" and add a GLOBAL unique index on (server_key, account_id).

-- 1) Add the column (nullable first, backfilled below).
ALTER TABLE "chatwoot_instances" ADD COLUMN "server_key" TEXT;

-- 2) Backfill from the parent deployment's base URL, normalized the same way the app does
--    (lowercase origin, no trailing slash — origin-only URLs, so lower() is safe).
UPDATE "chatwoot_instances" i
SET "server_key" = lower(rtrim(d."base_url", '/'))
FROM "chatwoot_deployments" d
WHERE i."deployment_id" = d."id";

-- 3) Enforce NOT NULL now that every row has a value.
ALTER TABLE "chatwoot_instances" ALTER COLUMN "server_key" SET NOT NULL;

-- 4) The hard cross-tenant guarantee. Postgres enforces this index regardless of RLS row visibility,
--    so a second tenant claiming the same (server, account) fails even though it can't SEE the
--    other tenant's row. NOTE: fails if two tenants already share a (server_key, account_id) — that
--    is a tenant-isolation bug; resolve the data before deploying.
CREATE UNIQUE INDEX "chatwoot_instances_server_key_account_id_key"
  ON "chatwoot_instances"("server_key", "account_id");
