-- Data migration: the `drive_get_link` Google Drive tool was removed (the search now returns the
-- shareable link directly). Prune it from any persisted agent tool selection so save/validation no
-- longer rejects the stale entry ("tool drive_get_link is not available for integration GOOGLE_DRIVE")
-- and the runtime stops carrying an orphan grant. array_remove drops every occurrence; the WHERE keeps
-- the update to only the affected rows.
UPDATE "agent_tool_selections"
SET "enabled_tools" = array_remove("enabled_tools", 'drive_get_link')
WHERE 'drive_get_link' = ANY("enabled_tools");
