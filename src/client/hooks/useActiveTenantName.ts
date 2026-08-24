import { useEffect, useState } from "react";
import { useAuth } from "@/client/contexts/AuthContext";
import {
  getActiveTenantId,
  TENANTS_CHANGED_EVENT,
} from "@/client/lib/activeTenant";
import { api } from "@/client/lib/api";

// The active tenant's display name (e.g. for the {{nome_empresa}} preview variable). A tenant-scoped
// user gets it straight from /auth/me (user.tenantName). A SUPER_ADMIN has tenantId null — /auth/me
// returns tenantName null by design — and drives a client-side tenant selector, so we resolve the
// SELECTED tenant's name from the tenant list, mirroring the header TenantSwitcher, and refetch when
// the set of tenants changes. Returns null while still resolving (or when no tenant is selected).
export function useActiveTenantName(): string | null {
  const { user } = useAuth();
  const direct = user?.tenantName ?? null;
  const isSuper = user?.role === "SUPER_ADMIN" && user.tenantId === null;
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuper) {
      setResolved(null);
      return;
    }
    let on = true;
    const fetchName = () => {
      const activeId = getActiveTenantId();
      if (!activeId) {
        setResolved(null);
        return;
      }
      api.api.v1.tenants
        .get()
        .then(({ data, error }) => {
          if (!on || error || !data) return;
          setResolved(
            data.tenants.find((tn) => tn.id === activeId)?.name ?? null,
          );
        })
        .catch(() => {});
    };
    fetchName();
    // A tenant created elsewhere (CreateTenantModal) becomes nameable without a reload.
    window.addEventListener(TENANTS_CHANGED_EVENT, fetchName);
    return () => {
      on = false;
      window.removeEventListener(TENANTS_CHANGED_EVENT, fetchName);
    };
  }, [isSuper]);

  return isSuper ? resolved : direct;
}
