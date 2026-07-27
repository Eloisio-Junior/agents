import { Elysia, t } from "elysia";
import { doc, errors } from "@/api/lib/openapi";
import { tenancyPlugin } from "@/api/middlewares/tenancy";
import { ForbiddenError, TenantTargetRequiredError } from "@/lib/errors";
import { instanceIdentity } from "@/lib/instance";
import type { TenantContext } from "@/lib/tenancy";
import { listCredentialCalendars } from "@/modules/integrations/google-calendar.service";
import { listCredentialDriveFolders } from "@/modules/integrations/google-drive.service";
import {
  createIntegrationInstance,
  deleteIntegrationInstance,
  getIntegrationInstance,
  listCatalog,
  listIntegrationInstances,
  updateIntegrationInstance,
} from "@/modules/integrations/service";
import { getToolpackToolViews } from "@/modules/integrations/toolpacks";

// Integration-instance management (per-tenant). TENANT_ADMIN. Separate from the PUBLIC inbound
// receptor controller (same /v1/integrations prefix, no path overlap: /catalog + /instances* here
// vs /inbound/:routeToken there) so the high-volume webhook path stays free of the session lookup.
// The opaque routeToken is returned ONCE on create and never again.

function ctxOrThrow(ctx: TenantContext | null): TenantContext {
  if (!ctx) throw new ForbiddenError();
  if (ctx.tenantId === null) throw new TenantTargetRequiredError();
  return ctx;
}

const authStrategy = t.Union(
  [t.Literal("NONE"), t.Literal("STATIC_HEADER"), t.Literal("HMAC_SHA256")],
  {
    description:
      "Inbound webhook auth: NONE, STATIC_HEADER (shared token header), or HMAC_SHA256 (signed body).",
  },
);

export const integrationsAdminController = new Elysia({
  prefix: "/v1/integrations",
  tags: ["Integrations"],
})
  .use(tenancyPlugin)
  .get(
    "/catalog",
    ({ tenantContext }) => {
      ctxOrThrow(tenantContext);
      // Enrich each entry with its toolpack's tools (name + risk + arg specs) so the per-toolpack
      // modal can list what the integration exposes, with args, without a second request.
      const catalog = listCatalog().map((e) => ({
        ...e,
        tools: getToolpackToolViews(e.catalogType),
      }));
      return { instance: instanceIdentity, catalog };
    },
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "List integration catalog",
        "Returns the available integration catalog entries the tenant can instantiate.",
      ),
      response: errors(401, 403),
    },
  )
  .get(
    "/google/calendars",
    async ({ tenantContext, query }) => {
      const ctx = ctxOrThrow(tenantContext);
      const calendars = await listCredentialCalendars(ctx, query.credentialRef);
      return { instance: instanceIdentity, calendars };
    },
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "List Google calendars for a credential",
        "Lists the calendars a connected google_oauth credential can access, so the operator can pick which agendas the Calendar integration may operate on. Read-only against Google.",
      ),
      query: t.Object({
        credentialRef: t.String({
          description:
            "Vault reference (vault:<id>) of a connected google_oauth credential.",
        }),
      }),
      response: errors(400, 401, 403, 404),
    },
  )
  .get(
    "/google/drive-folders",
    async ({ tenantContext, query }) => {
      const ctx = ctxOrThrow(tenantContext);
      const folders = await listCredentialDriveFolders(
        ctx,
        query.credentialRef,
      );
      return { instance: instanceIdentity, folders };
    },
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "List Google Drive folders for a credential",
        "Lists the folders a connected google_oauth credential can access, so the operator can pick which folder the Drive integration scopes file search to. Read-only against Google.",
      ),
      query: t.Object({
        credentialRef: t.String({
          description:
            "Vault reference (vault:<id>) of a connected google_oauth credential.",
        }),
      }),
      response: errors(400, 401, 403, 404),
    },
  )
  .get(
    "/instances",
    async ({ tenantContext }) => ({
      instance: instanceIdentity,
      instances: await listIntegrationInstances(ctxOrThrow(tenantContext)),
    }),
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "List integration instances",
        "Returns the tenant's configured integration instances; the routeToken is never returned after creation.",
      ),
      response: errors(401, 403),
    },
  )
  .get(
    "/instances/:id",
    async ({ tenantContext, params }) => ({
      instance: instanceIdentity,
      integration: await getIntegrationInstance(
        ctxOrThrow(tenantContext),
        BigInt(params.id),
      ),
    }),
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "Get integration instance",
        "Fetches a single integration instance by id; the routeToken is never returned after creation.",
      ),
      params: t.Object({
        id: t.String({
          description:
            "Integration instance id (BigInt serialized as a string).",
        }),
      }),
      response: errors(400, 401, 403, 404),
    },
  )
  .post(
    "/instances",
    async ({ tenantContext, body }) => {
      const ctx = ctxOrThrow(tenantContext);
      const b = body as {
        catalogType: string;
        name: string;
        config?: Record<string, unknown>;
        credentialRef?: string | null;
        inboundAuthStrategy?: "NONE" | "STATIC_HEADER" | "HMAC_SHA256";
        inboundSecretRef?: string | null;
        enabled?: boolean;
      };
      const created = await createIntegrationInstance(
        ctx.tenantId as bigint,
        b,
      );
      return {
        instance: instanceIdentity,
        id: String(created.id),
        // Shown ONCE — paste into the upstream provider; it is never returned again.
        routeToken: created.routeToken,
      };
    },
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "Create integration instance",
        "Creates an integration instance and returns its id plus the opaque routeToken, which is shown only once and never returned again.",
      ),
      body: t.Object({
        catalogType: t.String({
          description: "Catalog entry type to instantiate, from GET /catalog.",
        }),
        name: t.String({
          minLength: 1,
          maxLength: 200,
          description: "Display label for the instance (1 to 200 characters).",
        }),
        config: t.Optional(
          t.Record(t.String(), t.Unknown(), {
            description: "Provider-specific configuration map.",
          }),
        ),
        credentialRef: t.Optional(
          t.Union([t.String(), t.Null()], {
            description:
              "Vault reference name for the outbound credential (never the secret itself), or null for none.",
          }),
        ),
        inboundAuthStrategy: t.Optional(authStrategy),
        inboundSecretRef: t.Optional(
          t.Union([t.String(), t.Null()], {
            description:
              "Vault reference name for the inbound auth secret (never the secret itself), or null for none.",
          }),
        ),
        enabled: t.Optional(
          t.Boolean({
            description: "Whether the integration instance is active.",
          }),
        ),
      }),
      response: errors(400, 401, 403),
    },
  )
  .patch(
    "/instances/:id",
    async ({ tenantContext, params, body }) => ({
      instance: instanceIdentity,
      integration: await updateIntegrationInstance(
        ctxOrThrow(tenantContext),
        BigInt(params.id),
        body as {
          name?: string;
          enabled?: boolean;
          config?: Record<string, unknown>;
          credentialRef?: string | null;
          inboundAuthStrategy?: "NONE" | "STATIC_HEADER" | "HMAC_SHA256";
          inboundSecretRef?: string | null;
        },
      ),
    }),
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "Update integration instance",
        "Updates fields of an integration instance by id; the routeToken is never returned after creation.",
      ),
      params: t.Object({
        id: t.String({
          description:
            "Integration instance id (BigInt serialized as a string).",
        }),
      }),
      body: t.Object({
        name: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 200,
            description: "New display label (1 to 200 characters).",
          }),
        ),
        enabled: t.Optional(
          t.Boolean({
            description: "Whether the integration instance is active.",
          }),
        ),
        config: t.Optional(
          t.Record(t.String(), t.Unknown(), {
            description: "New provider-specific configuration map.",
          }),
        ),
        credentialRef: t.Optional(
          t.Union([t.String(), t.Null()], {
            description:
              "New vault reference name for the outbound credential, or null to clear it.",
          }),
        ),
        inboundAuthStrategy: t.Optional(authStrategy),
        inboundSecretRef: t.Optional(
          t.Union([t.String(), t.Null()], {
            description:
              "New vault reference name for the inbound auth secret, or null to clear it.",
          }),
        ),
      }),
      response: errors(400, 401, 403, 404),
    },
  )
  .delete(
    "/instances/:id",
    async ({ tenantContext, params }) => {
      await deleteIntegrationInstance(
        ctxOrThrow(tenantContext),
        BigInt(params.id),
      );
      return { instance: instanceIdentity, success: true };
    },
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "Delete integration instance",
        "Removes an integration instance by id.",
      ),
      params: t.Object({
        id: t.String({
          description:
            "Integration instance id (BigInt serialized as a string).",
        }),
      }),
      response: errors(400, 401, 403, 404),
    },
  );
