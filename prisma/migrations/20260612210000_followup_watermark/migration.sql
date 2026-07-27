-- Add follow-up watermark column to conversations.
-- Enables single-shot semantics: after a follow-up fires (sent or silenced), the next one
-- can only happen once the client speaks again (lastInboundAt > lastFollowUpAt).
ALTER TABLE "conversations" ADD COLUMN "last_follow_up_at" TIMESTAMP(3);
