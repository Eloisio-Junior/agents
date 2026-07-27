import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { useBreadcrumbLabels } from "@/client/contexts/BreadcrumbContext";
import { buildBreadcrumbs } from "@/client/lib/breadcrumbs";

export function Breadcrumbs() {
  const { t } = useTranslation();
  const location = useLocation();
  const overrides = useBreadcrumbLabels();
  const crumbs = buildBreadcrumbs(location.pathname, overrides);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label={t("nav.breadcrumbs", "Breadcrumbs")}
      className="hidden min-w-0 items-center md:flex"
    >
      <ol className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => {
          // biome-ignore lint/plugin/no-dynamic-i18n-key: extracted via magic comments in src/client/lib/breadcrumbs.ts
          const label = crumb.override ?? t(crumb.labelKey, crumb.defaultLabel);
          const isLast = index === crumbs.length - 1;
          return (
            <li
              key={crumb.to ?? `current:${crumb.labelKey}`}
              className="flex min-w-0 items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
              )}
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  className="truncate rounded px-1.5 py-0.5 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                >
                  {label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className="truncate px-1.5 py-0.5 font-medium text-text-primary"
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
