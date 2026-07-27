-- CreateTable
CREATE TABLE "playground_media" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "file_name" TEXT,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playground_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playground_media_tenant_id_thread_id_idx" ON "playground_media"("tenant_id", "thread_id");

-- RLS: playground_media follows the same tenant_isolation policy pattern as other tenant-scoped tables.
ALTER TABLE "playground_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "playground_media" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "playground_media"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );
