import { Palette, Server, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { PageContainer } from "@/client/components";
import { cn } from "@/client/lib/utils";

// t('settings.title', 'Settings')
// t('settings.subtitle', 'Manage your account and preferences')
// t('settings.sections', 'Settings sections')
// t('settings.profile', 'Profile')
// t('settings.appearance', 'Appearance')
// t('settings.mcp', 'MCP')
const TABS = [
  { to: "/settings/profile", labelKey: "settings.profile", icon: UserRound },
  {
    to: "/settings/appearance",
    labelKey: "settings.appearance",
    icon: Palette,
  },
  { to: "/settings/mcp", labelKey: "settings.mcp", icon: Server },
];

export function SettingsLayout() {
  const { t } = useTranslation();

  return (
    <PageContainer size="narrow" className="flex flex-col gap-6">
      <header>
        <h1 className="font-semibold text-text-primary text-xl">
          {t("settings.title", "Settings")}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {t("settings.subtitle", "Manage your account and preferences")}
        </p>
      </header>

      <nav
        aria-label={t("settings.sections", "Settings sections")}
        className="-mb-px flex gap-1 border-border border-b"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 font-medium text-sm transition-colors",
                  {
                    "border-accent text-text-primary": isActive,
                    "border-transparent text-text-secondary hover:text-text-primary":
                      !isActive,
                  },
                )
              }
            >
              <Icon className="h-4 w-4" />
              {/* biome-ignore lint/plugin/no-dynamic-i18n-key: extracted via magic comments above TABS */}
              {t(tab.labelKey)}
            </NavLink>
          );
        })}
      </nav>

      <Outlet />
    </PageContainer>
  );
}
