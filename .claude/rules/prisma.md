---
paths:
  - "prisma/**"
  - "prisma.config.ts"
---

# Prisma / migrations constraints

- `knowledge_chunks` is **externally managed** (`tables.external` in `prisma.config.ts`): the migrate diff ignores it, so any schema change to this table (columns, indexes) must be written by hand in a migration. Never remove the external config to "fix" a diff.
- The pgvector HNSW index `knowledge_chunks_embedding_hnsw` is not modeled by Prisma. A generated migration containing `DROP INDEX "knowledge_chunks_embedding_hnsw"` is a bug — it silently kills RAG KNN retrieval; delete that statement.
- Enums: a value added with `ALTER TYPE ... ADD VALUE` cannot be used (DML/DEFAULT) in the same migration that adds it. Split add-value and first-use into separate migrations.
- Runtime role, GRANTs and default privileges are provisioned by `scripts/db-bootstrap.ts` (runs before `migrate deploy` at boot) — never put them in migrations. The `vector` extension is the one exception: the baseline migration keeps an idempotent `CREATE EXTENSION IF NOT EXISTS vector` so the `migrate dev` shadow database can create `vector(...)` columns — don't remove it, and don't add extensions in later migrations.
- Never run a bare `prisma migrate reset`: it recreates the `public` schema and wipes the bootstrap-provisioned grants (Postgres `42501` on next boot). Use `bun db:reset`, or rerun `bun db:bootstrap` after any reset.
- RLS policies, partial/expression indexes and CHECK constraints are hand-written SQL in migrations (Prisma cannot model them). When adding a tenant-scoped table, add its `ENABLE`/`FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy in the same migration (see the tail of the baseline migration).
