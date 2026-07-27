-- WhatsApp 24h service window: anchor on the last INCOMING customer message. A proactive free-form
-- send (follow-up/nudge) is only allowed within the window; outside it, an approved template (HSM) is
-- required. Lands on the RLS-protected conversations table → inherits the tenant_isolation policy.
ALTER TABLE "conversations" ADD COLUMN "last_inbound_at" TIMESTAMP(3);
