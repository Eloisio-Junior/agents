-- Unified per-agent tool selection. Generalizes agent_tool_selections from "MCP XOR integration"
-- into one table with a `source` discriminator across NATIVE/RAG/HTTP/MCP/INTEGRATION. Backfills
-- the previously JSON-encoded selections (Agent.settings.{nativeTools,httpTools,rag}) and stamps
-- the existing MCP/integration rows, then strips the migrated keys from settings so there is a
-- single source of truth. Runs as the migration owner (bypasses RLS); tenant_id is copied from the
-- owning agent on every inserted row.

-- 1. discriminator type
CREATE TYPE "AgentToolSource" AS ENUM ('NATIVE', 'RAG', 'HTTP', 'MCP', 'INTEGRATION');

-- 2. new columns (source nullable until backfilled)
ALTER TABLE "agent_tool_selections"
  ADD COLUMN "source" "AgentToolSource",
  ADD COLUMN "tool_definition_id" BIGINT,
  ADD COLUMN "knowledge_base_ids" BIGINT[] NOT NULL DEFAULT '{}';

-- 3. HTTP target FK
ALTER TABLE "agent_tool_selections"
  ADD CONSTRAINT "agent_tool_selections_tool_definition_id_fkey"
  FOREIGN KEY ("tool_definition_id") REFERENCES "tool_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. drop the old XOR check BEFORE inserting NATIVE/RAG/HTTP rows (which have neither legacy fk)
ALTER TABLE "agent_tool_selections" DROP CONSTRAINT "agent_tool_selection_one_source_check";

-- 5. stamp existing rows (the old check guaranteed exactly one of the two fks)
UPDATE "agent_tool_selections" SET "source" = 'MCP' WHERE "mcp_server_connection_id" IS NOT NULL;
UPDATE "agent_tool_selections" SET "source" = 'INTEGRATION' WHERE "integration_instance_id" IS NOT NULL;

-- 6. backfill NATIVE: one row per agent. Empty enabled_tools == ALL native tools (the permissive
--    default, matching the prior "settings.nativeTools absent => all" semantics).
INSERT INTO "agent_tool_selections"
  ("tenant_id","agent_id","source","enabled_tools","knowledge_base_ids","created_at","updated_at")
SELECT a."tenant_id", a."id", 'NATIVE'::"AgentToolSource",
       ARRAY(SELECT jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(a."settings"->'nativeTools') = 'array'
              THEN a."settings"->'nativeTools' ELSE '[]'::jsonb END)),
       '{}'::bigint[], now(), now()
FROM "agents" a;

-- 7. backfill RAG: only when rag.tools is a non-empty array (otherwise no RAG = fail-closed).
INSERT INTO "agent_tool_selections"
  ("tenant_id","agent_id","source","enabled_tools","knowledge_base_ids","created_at","updated_at")
SELECT a."tenant_id", a."id", 'RAG'::"AgentToolSource",
       ARRAY(SELECT jsonb_array_elements_text(a."settings"->'rag'->'tools')),
       COALESCE(ARRAY(SELECT (jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(a."settings"->'rag'->'knowledgeBaseIds') = 'array'
              THEN a."settings"->'rag'->'knowledgeBaseIds' ELSE '[]'::jsonb END))::bigint),
         '{}'::bigint[]),
       now(), now()
FROM "agents" a
WHERE jsonb_typeof(a."settings"->'rag'->'tools') = 'array'
  AND jsonb_array_length(a."settings"->'rag'->'tools') > 0;

-- 8. backfill HTTP: one row per (agent, granted ToolDefinition). Names resolve to ids by
--    (tenant, name); orphan names (no matching definition) are dropped by the join.
INSERT INTO "agent_tool_selections"
  ("tenant_id","agent_id","source","tool_definition_id","enabled_tools","knowledge_base_ids","created_at","updated_at")
SELECT a."tenant_id", a."id", 'HTTP'::"AgentToolSource", td."id", '{}'::text[], '{}'::bigint[], now(), now()
FROM "agents" a
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(a."settings"->'httpTools') = 'array'
       THEN a."settings"->'httpTools' ELSE '[]'::jsonb END) AS ht(name)
JOIN "tool_definitions" td ON td."tenant_id" = a."tenant_id" AND td."name" = ht.name;

-- 9. strip the migrated keys from settings (single source of truth from here on)
UPDATE "agents" SET "settings" = (("settings" - 'nativeTools') - 'httpTools') - 'rag';

-- 10. source is now mandatory
ALTER TABLE "agent_tool_selections" ALTER COLUMN "source" SET NOT NULL;

-- 11. generalized check: exactly the target matching `source` is set.
ALTER TABLE "agent_tool_selections" ADD CONSTRAINT "agent_tool_selection_source_target_check" CHECK (
  ("source" = 'HTTP'        AND "tool_definition_id" IS NOT NULL AND "mcp_server_connection_id" IS NULL AND "integration_instance_id" IS NULL)
  OR ("source" = 'MCP'         AND "mcp_server_connection_id" IS NOT NULL AND "tool_definition_id" IS NULL AND "integration_instance_id" IS NULL)
  OR ("source" = 'INTEGRATION' AND "integration_instance_id" IS NOT NULL AND "tool_definition_id" IS NULL AND "mcp_server_connection_id" IS NULL)
  OR ("source" IN ('NATIVE','RAG') AND "tool_definition_id" IS NULL AND "mcp_server_connection_id" IS NULL AND "integration_instance_id" IS NULL)
);

-- 12. partial unique indexes: at most one NATIVE / one RAG row per agent; no duplicate target
--     per (agent, source) otherwise. NULLs-distinct would not enforce the singletons, hence partial.
CREATE UNIQUE INDEX "ats_native_uq" ON "agent_tool_selections" ("agent_id") WHERE "source" = 'NATIVE';
CREATE UNIQUE INDEX "ats_rag_uq" ON "agent_tool_selections" ("agent_id") WHERE "source" = 'RAG';
CREATE UNIQUE INDEX "ats_http_uq" ON "agent_tool_selections" ("agent_id", "tool_definition_id") WHERE "source" = 'HTTP';
CREATE UNIQUE INDEX "ats_mcp_uq" ON "agent_tool_selections" ("agent_id", "mcp_server_connection_id") WHERE "source" = 'MCP';
CREATE UNIQUE INDEX "ats_integration_uq" ON "agent_tool_selections" ("agent_id", "integration_instance_id") WHERE "source" = 'INTEGRATION';
