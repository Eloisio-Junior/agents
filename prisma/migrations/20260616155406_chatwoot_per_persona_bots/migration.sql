-- One Chatwoot Agent Bot per (instance, our Agent persona). The single per-instance bot identity
-- on chatwoot_instances is replaced by this table, so each persona has its own visible sender
-- (name + avatar), HMAC secret, route token, and access token. No back-compat (pre-production):
-- the old per-instance bot is dropped and re-provisioned lazily on the next bind.

-- CreateTable
CREATE TABLE "chatwoot_agent_bots" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "chatwoot_instance_id" BIGINT NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "chatwoot_agent_bot_id" INTEGER NOT NULL,
    "access_token" TEXT NOT NULL,
    "webhook_secret" TEXT NOT NULL,
    "webhook_route_token_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_agent_bots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_agent_bots_webhook_route_token_hash_key" ON "chatwoot_agent_bots"("webhook_route_token_hash");

-- CreateIndex
CREATE INDEX "chatwoot_agent_bots_tenant_id_idx" ON "chatwoot_agent_bots"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_agent_bots_tenant_id_chatwoot_instance_id_agent_id_key" ON "chatwoot_agent_bots"("tenant_id", "chatwoot_instance_id", "agent_id");

-- AddForeignKey
ALTER TABLE "chatwoot_agent_bots" ADD CONSTRAINT "chatwoot_agent_bots_chatwoot_instance_id_fkey" FOREIGN KEY ("chatwoot_instance_id") REFERENCES "chatwoot_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatwoot_agent_bots" ADD CONSTRAINT "chatwoot_agent_bots_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same tenant_isolation policy as every other tenant-scoped table (super-admin bypass for the
-- route-token resolution that runs before tenant context exists).
ALTER TABLE "chatwoot_agent_bots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chatwoot_agent_bots" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chatwoot_agent_bots"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );

-- Drop the per-instance bot identity (moved to chatwoot_agent_bots).
DROP INDEX IF EXISTS "chatwoot_instances_webhook_route_token_hash_key";
ALTER TABLE "chatwoot_instances"
  DROP COLUMN "agent_bot_id",
  DROP COLUMN "agent_bot_token",
  DROP COLUMN "webhook_secret",
  DROP COLUMN "webhook_route_token_hash";
