-- The editor now exposes only the display name (label) and derives the normalized identifier (name)
-- from it, so label is required. Backfill legacy rows (label was nullable) with their name before
-- enforcing NOT NULL, so the alter cannot fail on existing data.

-- Backfill
UPDATE "tool_definitions" SET "label" = "name" WHERE "label" IS NULL;

-- AlterTable
ALTER TABLE "tool_definitions" ALTER COLUMN "label" SET NOT NULL;
