import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, EmptyState } from "@/client/components";

export function ExperimentsTab() {
  const { t } = useTranslation();

  return (
    <Card>
      <EmptyState
        icon={FlaskConical}
        title={t(
          "experiments.comingSoonTitle",
          "A/B experiments are coming soon",
        )}
        description={t(
          "experiments.comingSoonDesc",
          "Run prompt variants side by side and compare outcomes. This feature is under construction.",
        )}
      />
    </Card>
  );
}
