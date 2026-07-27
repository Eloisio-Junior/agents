import { Building2, Palette, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { PageContainer } from "@/client/components";
import { useAuth } from "@/client/contexts/AuthContext";
import { cn } from "@/client/lib/utils";

// Admin shell. Mirrors SettingsLayout (NavLink tabs + <Outlet />). The Tenants and Identity tabs
// are SUPER_ADMIN-only (a TENANT_ADMIN has a single tenant and identity is fleet-global), so a
// tenant admin sees no tab bar — just the Users view scoped to their tenant.
// t('admin.tabUsers', 'Users')
// t('admin.tabTenants', 'Tenants')
// t('admin.tabBranding', 'Branding')
const TABS = [
  { to: "/admin/users", labelKey: "admin.tabUsers", icon: Users },
  { to: "/admin/tenants", labelKey: "admin.tabTenants", icon: Building2 },
  { to: "/admin/branding", labelKey: "admin.tabBranding", icon: Palette },
];

export function AdminLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  return (
    <PageContainer className="space-y-6">
      <header>
        <h1 className="font-bold text-2xl text-text-primary">
          {t("admin.title", "Admin Panel")}
        </h1>
      </header>

      {isSuperAdmin && (
        <nav
          aria-label={t("admin.sections", "Admin sections")}
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
                <Icon className="h-4 w-4" aria-hidden="true" />
                {/* biome-ignore lint/plugin/no-dynamic-i18n-key: extracted via magic comments above TABS */}
                {t(tab.labelKey)}
              </NavLink>
            );
          })}
        </nav>
      )}

      <Outlet />
    </PageContainer>
  );
}
