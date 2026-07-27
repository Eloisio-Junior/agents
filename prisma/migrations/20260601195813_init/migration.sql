-- pgvector must exist before any vector(...) column (also makes the shadow database used
-- by `prisma migrate dev` valid). Idempotent with scripts/db-bootstrap.sql.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "InboundAuthStrategy" AS ENUM ('NONE', 'STATIC_HEADER', 'HMAC_SHA256');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "InboundDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "SchedulerJobKind" AS ENUM ('FOLLOWUP', 'FOLLOWUP_SWEEP', 'WEBHOOK_RETRY');

-- CreateEnum
CREATE TYPE "SchedulerJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'DONE', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'EDITED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'READY');

-- CreateTable
CREATE TABLE "tenants" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "demo_mode" BOOLEAN NOT NULL DEFAULT false,
    "branding" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatwoot_instances" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "base_url" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "admin_token" TEXT NOT NULL,
    "agent_bot_id" INTEGER,
    "agent_bot_token" TEXT,
    "webhook_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inboxes" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "chatwoot_instance_id" BIGINT NOT NULL,
    "chatwoot_inbox_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "channel_type" TEXT,
    "agent_id" BIGINT,
    "working_hours" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "chatwoot_contact_id" INTEGER,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "chatwoot_instance_id" BIGINT NOT NULL,
    "inbox_id" BIGINT,
    "contact_id" BIGINT,
    "chatwoot_conversation_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "assignee_id" INTEGER,
    "assignee_type" TEXT,
    "thread_id" TEXT NOT NULL,
    "last_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "model_config" JSONB NOT NULL DEFAULT '{}',
    "business_hours_id" BIGINT,
    "follow_up_policy_id" BIGINT,
    "transfer_with_summary" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "windows" JSONB NOT NULL DEFAULT '[]',
    "out_of_hours_behavior" TEXT,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_policies" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "embedding_model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "knowledge_base_id" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_queue_items" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "knowledge_base_id" BIGINT NOT NULL,
    "thread_id" TEXT,
    "interrupt_key" TEXT,
    "proposed_title" TEXT,
    "proposed_content" TEXT NOT NULL,
    "rationale" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_entries" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_definitions" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "url_template" TEXT NOT NULL,
    "allowed_hosts" TEXT[],
    "headers" JSONB NOT NULL DEFAULT '{}',
    "input_schema" JSONB NOT NULL DEFAULT '{}',
    "output_schema" JSONB NOT NULL DEFAULT '{}',
    "credential_ref" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_server_connections" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "url" TEXT,
    "command" TEXT,
    "credential_ref" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_instances" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "catalog_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credential_ref" TEXT,
    "inbound_auth_strategy" "InboundAuthStrategy" NOT NULL DEFAULT 'NONE',
    "inbound_secret_ref" TEXT,
    "route_token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_selections" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "mcp_server_connection_id" BIGINT,
    "integration_instance_id" BIGINT,
    "enabled_tools" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_tool_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_external_refs" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "integration_instance_id" BIGINT NOT NULL,
    "external_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_external_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_deliveries" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "integration_instance_id" BIGINT NOT NULL,
    "external_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "InboundDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "inbound_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" DECIMAL(14,2),
    "currency" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_ref" TEXT,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_webhook_deliveries" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "subscription_id" BIGINT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_jobs" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "kind" "SchedulerJobKind" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "SchedulerJobStatus" NOT NULL DEFAULT 'PENDING',
    "run_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "conversation_id" BIGINT,
    "thread_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "pdf_storage_key" TEXT,
    "access_token_hash" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "agent_id" BIGINT,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_variant_assignments" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "experiment_id" BIGINT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "variant_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_variant_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "agent_id" BIGINT,
    "conversation_id" BIGINT,
    "thread_id" TEXT,
    "model" TEXT NOT NULL,
    "node" TEXT,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT,
    "actor_id" BIGINT,
    "actor_type" TEXT NOT NULL DEFAULT 'user',
    "action" TEXT NOT NULL,
    "target" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_clients" (
    "id" BIGSERIAL NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_hash" TEXT,
    "name" TEXT NOT NULL,
    "redirect_uris" TEXT[],
    "grant_types" TEXT[],
    "scopes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_authorization_codes" (
    "id" BIGSERIAL NOT NULL,
    "code_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "tenant_id" BIGINT,
    "redirect_uri" TEXT NOT NULL,
    "scopes" TEXT[],
    "code_challenge" TEXT,
    "code_challenge_method" TEXT,
    "resource" TEXT,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_access_tokens" (
    "id" BIGSERIAL NOT NULL,
    "jti" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "tenant_id" BIGINT,
    "role" "UserRole" NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_refresh_tokens" (
    "id" BIGSERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "tenant_id" BIGINT,
    "scopes" TEXT[],
    "family_id" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "rotated_to" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "chatwoot_instances_tenant_id_idx" ON "chatwoot_instances"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_instances_tenant_id_account_id_key" ON "chatwoot_instances"("tenant_id", "account_id");

-- CreateIndex
CREATE INDEX "inboxes_tenant_id_idx" ON "inboxes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inboxes_tenant_id_chatwoot_instance_id_chatwoot_inbox_id_key" ON "inboxes"("tenant_id", "chatwoot_instance_id", "chatwoot_inbox_id");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_idx" ON "contacts"("tenant_id");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_idx" ON "conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "conversations_thread_id_idx" ON "conversations"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_tenant_id_chatwoot_instance_id_chatwoot_conve_key" ON "conversations"("tenant_id", "chatwoot_instance_id", "chatwoot_conversation_id");

-- CreateIndex
CREATE INDEX "agents_tenant_id_idx" ON "agents"("tenant_id");

-- CreateIndex
CREATE INDEX "business_hours_tenant_id_idx" ON "business_hours"("tenant_id");

-- CreateIndex
CREATE INDEX "follow_up_policies_tenant_id_idx" ON "follow_up_policies"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_tenant_id_idx" ON "knowledge_bases"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_tenant_id_idx" ON "knowledge_chunks"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_knowledge_base_id_idx" ON "knowledge_chunks"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "approval_queue_items_tenant_id_idx" ON "approval_queue_items"("tenant_id");

-- CreateIndex
CREATE INDEX "vault_entries_tenant_id_idx" ON "vault_entries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vault_entries_tenant_id_name_key" ON "vault_entries"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "tool_definitions_tenant_id_idx" ON "tool_definitions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tool_definitions_tenant_id_name_key" ON "tool_definitions"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "mcp_server_connections_tenant_id_idx" ON "mcp_server_connections"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_server_connections_tenant_id_name_key" ON "mcp_server_connections"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "integration_instances_route_token_hash_key" ON "integration_instances"("route_token_hash");

-- CreateIndex
CREATE INDEX "integration_instances_tenant_id_idx" ON "integration_instances"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_instances_tenant_id_catalog_type_name_key" ON "integration_instances"("tenant_id", "catalog_type", "name");

-- CreateIndex
CREATE INDEX "agent_tool_selections_tenant_id_idx" ON "agent_tool_selections"("tenant_id");

-- CreateIndex
CREATE INDEX "agent_tool_selections_agent_id_idx" ON "agent_tool_selections"("agent_id");

-- CreateIndex
CREATE INDEX "integration_external_refs_tenant_id_idx" ON "integration_external_refs"("tenant_id");

-- CreateIndex
CREATE INDEX "integration_external_refs_thread_id_idx" ON "integration_external_refs"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_external_refs_tenant_id_external_id_key" ON "integration_external_refs"("tenant_id", "external_id");

-- CreateIndex
CREATE INDEX "inbound_deliveries_tenant_id_idx" ON "inbound_deliveries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_deliveries_tenant_id_integration_instance_id_dedupe_key" ON "inbound_deliveries"("tenant_id", "integration_instance_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "conversion_events_tenant_id_idx" ON "conversion_events"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_events_tenant_id_thread_id_source_key" ON "conversion_events"("tenant_id", "thread_id", "source");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_tenant_id_idx" ON "webhook_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "outbound_webhook_deliveries_tenant_id_idx" ON "outbound_webhook_deliveries"("tenant_id");

-- CreateIndex
CREATE INDEX "outbound_webhook_deliveries_status_next_attempt_at_idx" ON "outbound_webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "scheduler_jobs_status_run_at_idx" ON "scheduler_jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "scheduler_jobs_tenant_id_idx" ON "scheduler_jobs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_jobs_tenant_id_kind_dedupe_key_key" ON "scheduler_jobs"("tenant_id", "kind", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_access_token_hash_key" ON "quotes"("access_token_hash");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_idx" ON "quotes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenant_id_idempotency_key_key" ON "quotes"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "experiments_tenant_id_idx" ON "experiments"("tenant_id");

-- CreateIndex
CREATE INDEX "prompt_variant_assignments_tenant_id_idx" ON "prompt_variant_assignments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_variant_assignments_tenant_id_thread_id_experiment_i_key" ON "prompt_variant_assignments"("tenant_id", "thread_id", "experiment_id");

-- CreateIndex
CREATE INDEX "llm_usage_tenant_id_created_at_idx" ON "llm_usage"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "llm_usage_tenant_id_agent_id_idx" ON "llm_usage"("tenant_id", "agent_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_clients_client_id_key" ON "mcp_oauth_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_authorization_codes_code_hash_key" ON "mcp_oauth_authorization_codes"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_access_tokens_jti_key" ON "mcp_oauth_access_tokens"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_refresh_tokens_token_hash_key" ON "mcp_oauth_refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_refresh_tokens_jti_key" ON "mcp_oauth_refresh_tokens"("jti");

-- AddForeignKey
ALTER TABLE "inboxes" ADD CONSTRAINT "inboxes_chatwoot_instance_id_fkey" FOREIGN KEY ("chatwoot_instance_id") REFERENCES "chatwoot_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_chatwoot_instance_id_fkey" FOREIGN KEY ("chatwoot_instance_id") REFERENCES "chatwoot_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inbox_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_selections" ADD CONSTRAINT "agent_tool_selections_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_selections" ADD CONSTRAINT "agent_tool_selections_mcp_server_connection_id_fkey" FOREIGN KEY ("mcp_server_connection_id") REFERENCES "mcp_server_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_selections" ADD CONSTRAINT "agent_tool_selections_integration_instance_id_fkey" FOREIGN KEY ("integration_instance_id") REFERENCES "integration_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_external_refs" ADD CONSTRAINT "integration_external_refs_integration_instance_id_fkey" FOREIGN KEY ("integration_instance_id") REFERENCES "integration_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_deliveries" ADD CONSTRAINT "inbound_deliveries_integration_instance_id_fkey" FOREIGN KEY ("integration_instance_id") REFERENCES "integration_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_webhook_deliveries" ADD CONSTRAINT "outbound_webhook_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_variant_assignments" ADD CONSTRAINT "prompt_variant_assignments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Tenant isolation, hardening & pgvector index (not modeled by Prisma).
-- ════════════════════════════════════════════════════════════════════════════

-- Per-tenant case-insensitive email uniqueness; SUPER_ADMIN (tenant_id NULL) unique
-- globally by lower(email) via a separate partial index.
DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_tenant_email_key"
  ON "users" ("tenant_id", lower("email")) WHERE "tenant_id" IS NOT NULL;
CREATE UNIQUE INDEX "users_superadmin_email_key"
  ON "users" (lower("email")) WHERE "tenant_id" IS NULL;

-- SUPER_ADMIN has no tenant; everyone else must have one.
ALTER TABLE "users" ADD CONSTRAINT "users_role_tenant_check" CHECK (
  ("role" = 'SUPER_ADMIN' AND "tenant_id" IS NULL)
  OR ("role" <> 'SUPER_ADMIN' AND "tenant_id" IS NOT NULL)
);

-- Every user needs at least one credential (preserved from the template).
ALTER TABLE "users" ADD CONSTRAINT "users_auth_method_check"
  CHECK ("password_hash" IS NOT NULL OR "google_id" IS NOT NULL);

-- agent_tool_selections: exactly one source (MCP connection XOR integration instance).
ALTER TABLE "agent_tool_selections" ADD CONSTRAINT "agent_tool_selection_one_source_check" CHECK (
  ("mcp_server_connection_id" IS NOT NULL)::int + ("integration_instance_id" IS NOT NULL)::int = 1
);

-- pgvector HNSW index (cosine) for KNN retrieval.
CREATE INDEX "knowledge_chunks_embedding_hnsw"
  ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- ── Row-Level Security ──
-- The TenancyProvider sets app.tenant_id transaction-local; missing GUCs → NULL → fail-closed.
-- The audited asSuperAdmin() path sets app.is_super_admin='on'.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'chatwoot_instances','inboxes','contacts','conversations','agents',
    'business_hours','follow_up_policies','knowledge_bases','knowledge_chunks',
    'approval_queue_items','vault_entries','tool_definitions','mcp_server_connections',
    'integration_instances','agent_tool_selections','integration_external_refs',
    'inbound_deliveries','conversion_events','webhook_subscriptions',
    'outbound_webhook_deliveries','scheduler_jobs','quotes','experiments',
    'prompt_variant_assignments','llm_usage'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (
          current_setting('app.is_super_admin', true) = 'on'
          OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
        )
        WITH CHECK (
          current_setting('app.is_super_admin', true) = 'on'
          OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
        )
    $f$, t);
  END LOOP;
END $$;

-- tenants: keyed by id (own row); super-admin sees all.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenants"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );

-- audit_logs: tenant_id may be NULL (fleet). Tenants see only own non-null rows;
-- super-admin sees everything. Never leak NULL rows to a tenant.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR (tenant_id IS NOT NULL AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint)
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR (tenant_id IS NOT NULL AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint)
  );
