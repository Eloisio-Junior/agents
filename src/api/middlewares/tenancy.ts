import { Elysia } from "elysia";
import { authPlugin } from "@/api/lib/auth";
import logger from "@/api/lib/logger";
import { resolveRequestTenantContext } from "@/lib/tenancy";

// Elysia boundary that turns the authenticated user + X-Tenant-Id selector into a
// TenantContext. Services/handlers then pass it to runScoped/asSuperAdmin — they never
// read tenant from anywhere else. Depends on authPlugin for getAuthUser.
export const tenancyPlugin = new Elysia({ name: "tenancy" })
  .use(authPlugin)
  .derive({ as: "global" }, async ({ getAuthUser, headers }) => {
    const user = await getAuthUser();
    const { context, anomaly } = resolveRequestTenantContext(
      user,
      headers["x-tenant-id"],
    );
    // Tag audit attribution when the principal came from a Bearer API key (vs the cookie session).
    if (context && user?.isApiKey) context.actorType = "api_key";
    if (anomaly && user) {
      logger.warn(
        { userId: user.id.toString() },
        "Ignoring X-Tenant-Id header from a non-super-admin principal",
      );
    }
    return { tenantContext: context };
  });
