-- Configurable brand name (white-label): overrides the hardcoded "fazer.ai" in the document
-- title and the auth-page footer. NULL = use the default ("fazer.ai"). Part of the GLOBAL
-- app_branding singleton (no RLS); this migration runs as the owner.
ALTER TABLE "app_branding" ADD COLUMN "brand_name" TEXT;
