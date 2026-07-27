-- CreateTable
CREATE TABLE "playground_sessions" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playground_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playground_sessions_tenant_id_agent_id_updated_at_idx" ON "playground_sessions"("tenant_id", "agent_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "playground_sessions_tenant_id_thread_id_key" ON "playground_sessions"("tenant_id", "thread_id");

-- RLS: playground_sessions follows the same tenant_isolation policy pattern as other tenant-scoped tables.
ALTER TABLE "playground_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "playground_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "playground_sessions"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );
