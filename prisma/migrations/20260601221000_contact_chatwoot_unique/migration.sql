-- NOTE: `prisma migrate diff` also emits `DROP INDEX knowledge_chunks_embedding_hnsw`
-- (Prisma cannot model the manual HNSW index); omitted on purpose.

-- Unique key for idempotent Contact mirror upserts keyed by the Chatwoot contact id. The
-- column is nullable (Postgres allows multiple NULLs), so contacts without a Chatwoot id do
-- not conflict; the mirror only upserts when the id is present.
CREATE UNIQUE INDEX "contacts_tenant_id_chatwoot_contact_id_key" ON "contacts"("tenant_id", "chatwoot_contact_id");
