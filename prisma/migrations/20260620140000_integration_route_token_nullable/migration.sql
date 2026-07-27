-- Outbound-only integrations (Google Calendar/Drive) carry no inbound webhook, so they have no
-- route token. Make route_token_hash nullable; the existing unique index keeps NULLs distinct
-- in Postgres, so many tokenless instances coexist while real tokens stay unique.
ALTER TABLE "integration_instances" ALTER COLUMN "route_token_hash" DROP NOT NULL;
