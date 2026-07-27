-- DropIndex
DROP INDEX "knowledge_chunks_embedding_hnsw";

-- AlterTable
ALTER TABLE "agent_tool_selections" ALTER COLUMN "knowledge_base_ids" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vault_entries" ADD COLUMN     "base_url" TEXT,
ADD COLUMN     "param_name" TEXT;

-- DataMigration: rename generic injection kinds to the new parameterised names
UPDATE vault_entries SET kind = 'header', param_name = 'X-API-Key' WHERE kind = 'header_api_key';
UPDATE vault_entries SET kind = 'query', param_name = 'api_key' WHERE kind = 'query_api_key';
