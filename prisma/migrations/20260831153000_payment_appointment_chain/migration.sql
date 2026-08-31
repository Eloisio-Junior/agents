ALTER TYPE "SchedulerJobKind" ADD VALUE IF NOT EXISTS 'PAYMENT_APPOINTMENT';

ALTER TABLE "conversion_events" ADD COLUMN "external_id" TEXT;

-- Existing rows were unique by conversation/source. Preserve that identity while widening
-- future Asaas events to their provider payment id.
UPDATE "conversion_events" SET "external_id" = "thread_id";
ALTER TABLE "conversion_events" ALTER COLUMN "external_id" SET NOT NULL;

ALTER TABLE "conversion_events"
  DROP CONSTRAINT IF EXISTS "conversion_events_tenant_id_thread_id_source_key";

CREATE UNIQUE INDEX "conversion_events_tenant_id_source_external_id_key"
  ON "conversion_events"("tenant_id", "source", "external_id");
