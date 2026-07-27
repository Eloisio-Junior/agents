-- Store the Chatwoot account display name (refreshed on inbox sync; Chatwoot can rename it).
ALTER TABLE "chatwoot_instances" ADD COLUMN "account_name" TEXT;
