-- Global app identity/branding singleton (id = 1). GLOBAL table (NO row-level security):
-- it is read publicly, before any tenant/auth context exists (login/setup pages), so RLS would
-- fail-closed. Writes are gated to SUPER_ADMIN in the service layer. Runtime-role grants come
-- from ALTER DEFAULT PRIVILEGES (scripts/db-bootstrap.sql); this migration runs as the owner.
CREATE TABLE "app_branding" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "color_mode" TEXT NOT NULL DEFAULT 'SIMPLE',
    "brand_color" TEXT,
    "tokens_light" JSONB NOT NULL DEFAULT '{}',
    "tokens_dark" JSONB NOT NULL DEFAULT '{}',
    "logo_dark_key" TEXT,
    "logo_light_key" TEXT,
    "favicon_dark_key" TEXT,
    "favicon_light_key" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_branding_pkey" PRIMARY KEY ("id")
);

-- Enforce the singleton: there can only ever be one identity row.
ALTER TABLE "app_branding" ADD CONSTRAINT "app_branding_singleton_check" CHECK ("id" = 1);

-- Identity is now global; drop the unused per-tenant branding column.
ALTER TABLE "tenants" DROP COLUMN "branding";
