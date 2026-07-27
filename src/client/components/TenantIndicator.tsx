import { Building2 } from "lucide-react";
import { TenantSwitcher } from "@/client/components/TenantSwitcher";
import { useAuth } from "@/client/contexts/AuthContext";

// A SUPER_ADMIN gets the target-tenant switcher; everyone else sees the tenant-name badge.
export function TenantIndicator() {
  const { user } = useAuth();
  if (user?.role === "SUPER_ADMIN") return <TenantSwitcher />;
  return user?.tenantName ? (
    <span className="hidden items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-2 py-1.5 text-sm text-text-secondary sm:inline-flex">
      <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="max-w-50 truncate">{user.tenantName}</span>
    </span>
  ) : null;
}
