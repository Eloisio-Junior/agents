-- Per-tool risk tier (low|medium|high) on custom HTTP tool definitions. Surfaced in the
-- tool-selection UI so granting a write/financial tool is a deliberate, visible act. Native and
-- toolpack tool risks are declared in code (not stored), so only ToolDefinition needs a column.
ALTER TABLE "tool_definitions" ADD COLUMN "risk_tier" TEXT NOT NULL DEFAULT 'medium';
