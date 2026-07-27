-- Debounce: durable message-coalescing for inbound Chatwoot bursts.
-- DEBOUNCE is a new scheduler job kind drained by a faster, dedicated worker tick. The conversation
-- watermark records the last inbound message id already handled, so a flush re-fetches from Chatwoot
-- and answers only the new burst (idempotent across re-arm / retry / a concurrent claim). The new
-- column lands on an existing RLS-protected table, so it inherits the tenant_isolation policy.
ALTER TYPE "SchedulerJobKind" ADD VALUE 'DEBOUNCE';

ALTER TABLE "conversations" ADD COLUMN "last_handled_message_id" INTEGER;
