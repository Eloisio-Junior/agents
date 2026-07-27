import { Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/client/components";
import { useTheme } from "@/client/contexts/ThemeContext";
import { LANGUAGES } from "@/client/lib/languages";
import { cn } from "@/client/lib/utils";

type ThemeOption = {
  value: "auto" | "light" | "dark";
  labelKey: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: "auto", labelKey: "theme.auto", icon: Monitor },
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
];

const optionClass = (selected: boolean) =>
  cn(
    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-accent",
    {
      "border-accent bg-bg-hover text-text-primary": selected,
      "border-border bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary":
        !selected,
    },
  );

export function SettingsAppearancePage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const themeHeadingId = useId();
  const languageHeadingId = useId();

  return (
    <div className="@container grid @3xl:grid-cols-2 grid-cols-1 gap-4">
      <Card>
        <h2
          id={themeHeadingId}
          className="mb-1 font-semibold text-text-primary"
        >
          {t("theme.label", "Theme")}
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          {t(
            "settings.themeHint",
            "Choose light, dark, or follow your system.",
          )}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={themeHeadingId}
          className="grid gap-2 sm:grid-cols-3"
        >
          {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => {
            const selected = value === theme;
            return (
              <label
                key={value}
                className={cn(optionClass(selected), "justify-center")}
              >
                <input
                  type="radio"
                  name="appearance-theme"
                  value={value}
                  checked={selected}
                  onChange={() => setTheme(value)}
                  className="sr-only"
                />
                <Icon className="h-4 w-4" aria-hidden="true" />
                {/* biome-ignore lint/plugin/no-dynamic-i18n-key: extracted via magic comments in UserMenu.tsx */}
                <span>{t(labelKey)}</span>
              </label>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2
          id={languageHeadingId}
          className="mb-1 font-semibold text-text-primary"
        >
          {t("language.label", "Language")}
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          {t("settings.languageHint", "Applies instantly across the app.")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={languageHeadingId}
          className="grid gap-2 sm:grid-cols-2"
        >
          {LANGUAGES.map((lang) => {
            const selected = lang.code === i18n.language;
            return (
              <label key={lang.code} className={optionClass(selected)}>
                <input
                  type="radio"
                  name="appearance-language"
                  value={lang.code}
                  checked={selected}
                  onChange={() => i18n.changeLanguage(lang.code)}
                  className="sr-only"
                />
                <span className="text-base" aria-hidden="true">
                  {lang.flag}
                </span>
                <span>{lang.name}</span>
              </label>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
