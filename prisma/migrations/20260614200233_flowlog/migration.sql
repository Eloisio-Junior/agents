-- CreateTable
CREATE TABLE "execution_logs" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "turn_id" TEXT NOT NULL,
    "conversation_id" BIGINT,
    "agent_id" BIGINT,
    "inbox_id" BIGINT,
    "thread_id" TEXT,
    "stage" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "duration_ms" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'inbox',
    "detail" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_channels" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "min_level" TEXT NOT NULL DEFAULT 'error',
    "stages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_deliveries" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "stage" TEXT,
    "level" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execution_logs_tenant_id_created_at_idx" ON "execution_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "execution_logs_tenant_id_turn_id_idx" ON "execution_logs"("tenant_id", "turn_id");

-- CreateIndex
CREATE INDEX "execution_logs_tenant_id_level_created_at_idx" ON "execution_logs"("tenant_id", "level", "created_at");

-- CreateIndex
CREATE INDEX "execution_logs_tenant_id_conversation_id_idx" ON "execution_logs"("tenant_id", "conversation_id");

-- CreateIndex
CREATE INDEX "execution_logs_tenant_id_stage_created_at_idx" ON "execution_logs"("tenant_id", "stage", "created_at");

-- CreateIndex
CREATE INDEX "alert_channels_tenant_id_idx" ON "alert_channels"("tenant_id");

-- CreateIndex
CREATE INDEX "alert_deliveries_tenant_id_idx" ON "alert_deliveries"("tenant_id");

-- CreateIndex
CREATE INDEX "alert_deliveries_status_next_attempt_at_idx" ON "alert_deliveries"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "alert_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: the three observability tables follow the same tenant_isolation policy as other
-- tenant-scoped tables (super admin bypass + tenant_id match). No GRANTs needed — the runtime
-- role's default privileges cover new tables in the public schema.
ALTER TABLE "execution_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "execution_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "execution_logs"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );

ALTER TABLE "alert_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alert_channels" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "alert_channels"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );

ALTER TABLE "alert_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alert_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "alert_deliveries"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );
