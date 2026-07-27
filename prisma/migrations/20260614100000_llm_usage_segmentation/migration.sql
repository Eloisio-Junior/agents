-- Segment LLM usage so playground test turns no longer pollute real figures, and add
-- per-inbox granularity + cached-token accounting.
ALTER TABLE "llm_usage" ADD COLUMN "inbox_id" BIGINT;
ALTER TABLE "llm_usage" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'inbox';
ALTER TABLE "llm_usage" ADD COLUMN "cached_read_tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "llm_usage" ADD COLUMN "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "llm_usage_tenant_id_inbox_id_idx" ON "llm_usage"("tenant_id", "inbox_id");

-- Backfill: distinguish historical playground rows by the fenced thread id scheme
-- (tenantId:playground:agentId:uuid). Legacy inbox_id stays null (no data to reconstruct).
UPDATE "llm_usage" SET "source" = 'playground' WHERE "thread_id" LIKE '%:playground:%';
