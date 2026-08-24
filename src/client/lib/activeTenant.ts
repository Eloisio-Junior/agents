// The SUPER_ADMIN's selected target tenant, sent as X-Tenant-Id on every API call. The backend
// honors it ONLY for SUPER_ADMIN (it logs an anomaly + ignores it for anyone else), so a stale
// value in a non-super browser is harmless. Persisted so a reload keeps the selection.

const KEY = "@app:active-tenant";

export function getActiveTenantId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setActiveTenantId(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}

// The set of selectable tenants changed (a tenant was created). Components that cache the list
// (the header TenantSwitcher) listen for this to refetch without a full reload, so a freshly
// created tenant becomes selectable immediately.
export const TENANTS_CHANGED_EVENT = "tenants:changed";

export function notifyTenantsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TENANTS_CHANGED_EVENT));
}
