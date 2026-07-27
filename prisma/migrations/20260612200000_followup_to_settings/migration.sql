-- Migrate FollowUpPolicy → agent.settings.followUp
-- 1. Data migration: copy each agent's follow-up policy config into settings.followUp
-- 2. Drop the foreign-key column follow_up_policy_id from agents
-- 3. Drop the follow_up_policies table (and its RLS policy + index)
-- 4. Add follow_up_hours_id column to agents (bare FK, same pattern as business_hours_id)

-- Step 1: migrate existing policy config into agent settings
UPDATE "agents" a
SET "settings" = jsonb_set(
  COALESCE(a."settings", '{}'::jsonb),
  '{followUp}',
  jsonb_build_object(
    'enabled', COALESCE((fp."config"->>'enabled')::boolean, fp."enabled"),
    'delayValue', COALESCE((fp."config"->>'inactivityMinutes')::int, 60),
    'delayUnit', 'minutes',
    'instructions', ''
  )
)
FROM "follow_up_policies" fp
WHERE a."follow_up_policy_id" = fp."id";

-- Step 2: drop the FK column from agents
ALTER TABLE "agents" DROP COLUMN "follow_up_policy_id";

-- Step 3: drop the follow_up_policies table (RLS policy is on the table, drops with it)
DROP TABLE "follow_up_policies";

-- Step 4: add follow_up_hours_id to agents (bare FK, no constraint — mirrors business_hours_id)
ALTER TABLE "agents" ADD COLUMN "follow_up_hours_id" BIGINT;
