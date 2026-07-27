import "dotenv/config";
import { defineConfig } from "prisma/config";

// NOTE: Migrations / DDL run as a superuser-or-owner role (CREATE EXTENSION, enum and
// role changes), which the runtime connection must NOT be (RLS would become a no-op).
// Prefer MIGRATION_DATABASE_URL; fall back to DATABASE_URL for first-time/local setups.
// ${POSTGRES_PORT} is substituted manually because the Prisma CLI does not expand it.
const rawUrl =
  process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const databaseUrl = rawUrl?.replace(
  "${POSTGRES_PORT}",
  process.env["POSTGRES_PORT"] ?? "5432",
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
  experimental: {
    externalTables: true,
  },
  // NOTE: knowledge_chunks carries the pgvector column + HNSW index, which Prisma cannot
  // model — without this, every `migrate dev` diff proposes dropping the index. Externally
  // managed: schema changes to this table are written by hand in migrations.
  tables: {
    external: ["public.knowledge_chunks"],
  },
});
