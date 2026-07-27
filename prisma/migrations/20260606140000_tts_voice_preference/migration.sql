-- TTS audio replies: per-contact voice preference for the "preference" reply mode. NULL = unknown
-- (mirror what the customer sent); true = wants audio; false = wants text. Set by the agent's
-- set_voice_preference native tool. Lands on the RLS-protected contacts table → inherits the
-- tenant_isolation policy (no Chatwoot custom attribute involved).
ALTER TABLE "contacts" ADD COLUMN "voice_reply" BOOLEAN;
