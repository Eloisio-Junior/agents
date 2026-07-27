/*
  Warnings:

  - Added the required column `document_id` to the `knowledge_chunks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "SchedulerJobKind" ADD VALUE 'RAG_INGEST';

-- AlterTable
ALTER TABLE "knowledge_bases" ADD COLUMN     "chunk_overlap" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "chunk_size" INTEGER NOT NULL DEFAULT 1000;

-- Clears test chunks before adding the required document_id FK column
DELETE FROM knowledge_chunks;

-- AlterTable
ALTER TABLE "knowledge_chunks" ADD COLUMN     "document_id" BIGINT NOT NULL;

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "knowledge_base_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_documents_tenant_id_knowledge_base_id_idx" ON "knowledge_documents"("tenant_id", "knowledge_base_id");

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: knowledge_documents follows the same tenant_isolation policy pattern as other tenant-scoped tables.
ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "knowledge_documents"
  USING (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint
  );
