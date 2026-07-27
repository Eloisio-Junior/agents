import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/client/components";

// Save/Discard bar shared by the editor tabs. Styled as a card (rounded, bordered, distinct bg +
// shadow) to match the section cards. `mt-auto` pins it to the bottom of the tab's growing flex
// column, so on short pages it rests at the page bottom instead of floating mid-page; `sticky
// bottom-0` keeps it in view while scrolling long forms (its opaque bg hides content behind it).
// The bar doubles as the playground entry point: when `onOpenPlayground` is given it shows a
// left-aligned "test" button (the floating FAB is gone), with the save actions on the right.
// Discard shows only when dirty; `saveDisabled` lets a tab block Save.
export function TabActionBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saveDisabled,
  saveLabel,
  onOpenPlayground,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
  onOpenPlayground?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky bottom-0 z-10 mt-auto">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-secondary px-4 py-3 shadow-lg">
        {onOpenPlayground ? (
          <Button variant="secondary" onClick={onOpenPlayground}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {t("editor.openPlayground", "Test in playground")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="secondary" onClick={onDiscard}>
              {t("editor.discard", "Discard")}
            </Button>
          )}
          <Button
            onClick={onSave}
            loading={saving}
            disabled={saving || !!saveDisabled}
          >
            {saveLabel ?? t("common.save", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
