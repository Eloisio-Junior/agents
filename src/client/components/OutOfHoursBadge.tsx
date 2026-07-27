import { Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "./Badge";

// Shared "out of business hours" marker (item 23): a muted badge with a moon icon, shown wherever an
// agent's availability schedule is currently closed (conversation header, conversations list, agents
// list). The status is computed server-side, so the badge reflects the schedule's own timezone.
export function OutOfHoursBadge() {
  const { t } = useTranslation();
  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <Moon className="h-3 w-3" aria-hidden="true" />
      {t("outOfHours.badge", "Out of hours")}
    </Badge>
  );
}
