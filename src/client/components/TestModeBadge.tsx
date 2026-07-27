import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "./Badge";

// Shared "test mode" marker (item 1 + 4): accent (primary) badge + a flask icon so it reads
// distinctly from the amber status/unsaved badges. Three states:
//   - "agent": the agent itself is in test mode (lists / editor header) — no conversation context;
//   - "active": this conversation has been activated with /teste (the bot answers here);
//   - "waiting": a test agent, conversation not yet activated (the bot stays silent until /teste).
export function TestModeBadge({
  state,
}: {
  state: "agent" | "active" | "waiting";
}) {
  const { t } = useTranslation();
  const label =
    state === "active"
      ? t("testMode.badge.active", "Test mode · active")
      : state === "waiting"
        ? t("testMode.badge.waiting", "Test mode · awaiting /teste")
        : t("testMode.badge.agent", "Test mode");
  return (
    <Badge variant="primary" className="flex items-center gap-1">
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
