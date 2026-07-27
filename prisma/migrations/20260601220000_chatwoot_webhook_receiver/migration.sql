-- NOTE: `prisma migrate diff` also emits `DROP INDEX knowledge_chunks_embedding_hnsw`
-- because Prisma cannot model the manually-created HNSW index; that line is intentionally
-- omitted here (dropping it would break RAG KNN retrieval).

-- AlterTable: per-instance opaque route token (SHA-256) for the dedicated Chatwoot webhook
-- receiver. Resolves tenant+instance in constant time; plaintext lives only in Chatwoot's
-- stored Agent Bot outgoing_url.
ALTER TABLE "chatwoot_instances" ADD COLUMN     "webhook_route_token_hash" TEXT;

-- CreateTable: idempotency ledger keyed by the X-Chatwoot-Delivery UUID.
CREATE TABLE "chatwoot_webhook_deliveries" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "chatwoot_instance_id" BIGINT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" "InboundDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "chatwoot_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chatwoot_webhook_deliveries_tenant_id_idx" ON "chatwoot_webhook_deliveries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_webhook_deliveries_chatwoot_instance_id_delivery_i_key" ON "chatwoot_webhook_deliveries"("chatwoot_instance_id", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_instances_webhook_route_token_hash_key" ON "chatwoot_instances"("webhook_route_token_hash");

-- AddForeignKey
ALTER TABLE "chatwoot_webhook_deliveries" ADD CONSTRAINT "chatwoot_webhook_deliveries_chatwoot_instance_id_fkey" FOREIGN KEY ("chatwoot_instance_id") REFERENCES "chatwoot_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security for the new tenant-scoped table ──
-- Same policy as the baseline loop: fail-closed on missing GUC, super-admin bypass via
-- app.is_super_admin. Grants to the runtime role come from ALTER DEFAULT PRIVILEGES
-- (scripts/db-bootstrap.sql), since this migration runs as the same owner role.
ALTER TABLE "chatwoot_webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chatwoot_webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chatwoot_webhook_deliveries"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );
