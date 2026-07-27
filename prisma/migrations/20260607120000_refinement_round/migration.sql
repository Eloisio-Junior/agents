-- Refinement round (backlog todo.md): three groups of additive columns. All three land on tables
-- already under tenant RLS (conversations / tool_definitions / vault_entries), so they inherit the
-- existing tenant_isolation policies — no new policy is required.

-- Item 6 (re-engage): surface the last agent-turn failure on the conversation so the operator gets
-- a visible error badge + a manual "re-engage" action. Text is sanitized at the call site (no
-- PII/secret in the clear); both columns are cleared on a successful turn. NULL = last turn was fine.
ALTER TABLE "conversations" ADD COLUMN "last_error" TEXT;
ALTER TABLE "conversations" ADD COLUMN "last_error_at" TIMESTAMP(3);

-- Item 4 (slow-tool ack): an optional "I'll look into that for you…" message posted to the customer
-- before a (typically slow) custom HTTP tool runs. Per-tool, opt-in; default off so existing tools
-- keep behaving exactly as before.
ALTER TABLE "tool_definitions" ADD COLUMN "ack_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tool_definitions" ADD COLUMN "ack_message" TEXT;

-- Item 8 (predefined secret types): the secret kind drives auto-injection (header/bearer/basic/query)
-- when a tool references the credential, plus credential-ref filtering by compatible kind. Nullable;
-- legacy rows read as "generic" in code.
ALTER TABLE "vault_entries" ADD COLUMN "kind" TEXT;
