-- DropColumn: the per-contact "last conversation" divider marker moves to agent_threads, which is
-- keyed per (tenant, instance, contact_inbox) — the right granularity now that the graph memory
-- thread is per-contact-inbox (a multi-channel contact no longer shares one marker across channels).
ALTER TABLE "contacts" DROP COLUMN "last_conversation_id";

-- AddColumn: the native Chatwoot ContactInbox id (one contact on one inbox/channel), mirrored from
-- the webhook payload. Discriminator for the agent's graph memory thread.
ALTER TABLE "conversations" ADD COLUMN     "contact_inbox_id" INTEGER;

-- CreateTable
CREATE TABLE "agent_threads" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "chatwoot_instance_id" BIGINT NOT NULL,
    "contact_inbox_id" INTEGER NOT NULL,
    "thread_id" TEXT NOT NULL,
    "last_conversation_id" INTEGER,
    "last_synced_message_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_threads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_threads_tenant_id_idx" ON "agent_threads"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_threads_tenant_id_chatwoot_instance_id_contact_inbox__key" ON "agent_threads"("tenant_id", "chatwoot_instance_id", "contact_inbox_id");

-- AddForeignKey
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_chatwoot_instance_id_fkey" FOREIGN KEY ("chatwoot_instance_id") REFERENCES "chatwoot_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: agent_threads follows the same tenant_isolation policy as the other tenant-scoped tables
-- (super admin bypass + tenant_id match). No GRANTs needed — the runtime role's default privileges
-- cover new tables in the public schema.
ALTER TABLE "agent_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_threads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_threads"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );
