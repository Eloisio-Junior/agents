import { treaty } from "@elysiajs/eden";
import type { App } from "@/app";
import { getActiveTenantId } from "@/client/lib/activeTenant";
import i18n from "@/client/lib/i18n";

// NOTE: `parseDate: false` disables Eden treaty's default JSON reviver that
// auto-converts any string matching an ISO 8601 / RFC 1123 / dd-mm-yyyy regex
// into a `Date`. The conversion is invisible to the type system (Eden infers
// the wire-format shape, where `Date` already flattens to `string`), so call
// sites like `typeof v.expiresAt === "string"` silently start rejecting valid
// responses, and React effects with date fields in deps fire on every fetch
// because each parse yields a new `Date` instance. Keep this `false` and
// always treat date fields on the client as ISO strings. See `docs/eden-treaty.md`.
export const api = treaty<App>(window.location.origin, {
  headers: () => {
    const headers: Record<string, string> = {
      "Accept-Language": i18n.language,
    };
    // SUPER_ADMIN target tenant; honored server-side only for SUPER_ADMIN (anomaly-logged + ignored
    // otherwise), so sending it unconditionally is safe.
    const tenantId = getActiveTenantId();
    if (tenantId) headers["X-Tenant-Id"] = tenantId;
    return headers;
  },
  onResponse: (response) => {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    } else if (response.status === 429) {
      // Surfaced as a coalesced global toast (see GlobalApiToasts) so every page gets clear
      // rate-limit feedback, not just the ones that read err.status into a DataBoundary.
      window.dispatchEvent(new CustomEvent("api:rate-limited"));
    }
  },
  parseDate: false,
});
