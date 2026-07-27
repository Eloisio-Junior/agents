-- Capture the WhatsApp provider per inbox so the 24h service-window gate can tell the official
-- WhatsApp API (whatsapp_cloud / default=360dialog: have a window) from baileys/zapi (no window).
-- Additive + nullable; populated by the inbox-list sync. No RLS/index change.
ALTER TABLE "inboxes" ADD COLUMN "provider" TEXT;
