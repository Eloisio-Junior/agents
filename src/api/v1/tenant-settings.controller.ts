import { Elysia, t } from "elysia";
import { doc, errors } from "@/api/lib/openapi";
import { tenancyPlugin } from "@/api/middlewares/tenancy";
import { ForbiddenError, TenantTargetRequiredError } from "@/lib/errors";
import { instanceIdentity } from "@/lib/instance";
import type { TenantContext } from "@/lib/tenancy";
import { testLangfuseConnection } from "@/modules/analytics/langfuse-test";
import {
  getTenantSettings,
  updateEmbeddingSettings,
  updateLangfuse,
} from "@/modules/tenant-settings/service";

// Per-tenant feature settings (TENANT_ADMIN). Embedding (provider/model/credential for RAG) and
// Langfuse (tracing) configs live in Tenant.settings. Secret VALUES are never returned. The langfuse
// credential is now a standard vault entry (kind `langfuse`) created via the vault UI — this endpoint
// only stores the reference. GET exposes `credentialRef` (the picker needs it to show the selection).

function ctxOrThrow(ctx: TenantContext | null): TenantContext {
  if (!ctx) throw new ForbiddenError();
  if (ctx.tenantId === null) throw new TenantTargetRequiredError();
  return ctx;
}

export const tenantSettingsController = new Elysia({
  prefix: "/v1/tenant-settings",
  tags: ["Settings"],
})
  .use(tenancyPlugin)
  .get(
    "/",
    async ({ tenantContext }) => {
      const { embedding, langfuse } = await getTenantSettings(
        ctxOrThrow(tenantContext),
      );
      return {
        instance: instanceIdentity,
        embedding,
        langfuse: {
          enabled: langfuse.enabled,
          credentialRef: langfuse.credentialRef,
          sendContent: langfuse.sendContent,
          debug: langfuse.debug,
        },
      };
    },
    {
      requireRole: "TENANT_ADMIN",
      detail: doc(
        "Get tenant settings",
        "Returns the tenant's embedding and Langfuse settings.",
      ),
      response: errors(401, 403),
    },
  )
  .put(
    "/embedding",
    async ({ tenantContext, body }) => {
      const embedding = await updateEmbeddingSettings(
        ctxOrThrow(tenantContext),
        body,
      );
      return { instance: instanceIdentity, embedding };
    },
    {
      requireRole: "TENANT_ADMIN",
      body: t.Object({
        provider: t.Optional(
          t.Union([t.Literal("openai"), t.Literal("openai_compatible")], {
            description: "Embedding provider.",
          }),
        ),
        model: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 200,
            description: "Embedding model name.",
          }),
        ),
        credentialRef: t.Optional(
          t.Union([t.String(), t.Null()], {
            description:
              "Vault entry reference for the provider key (null clears it).",
          }),
        ),
        baseURL: t.Optional(
          t.Union([t.String(), t.Null()], {
            description:
              "Base URL for openai_compatible providers (null clears it).",
          }),
        ),
      }),
      detail: doc(
        "Update embedding settings",
        "Updates the tenant's RAG embedding configuration.",
      ),
      response: errors(400, 401, 403),
    },
  )
  .put(
    "/langfuse",
    async ({ tenantContext, body }) => {
      const langfuse = await updateLangfuse(ctxOrThrow(tenantContext), body);
      return {
        instance: instanceIdentity,
        langfuse: {
          enabled: langfuse.enabled,
          credentialRef: langfuse.credentialRef,
          sendContent: langfuse.sendContent,
          debug: langfuse.debug,
        },
      };
    },
    {
      requireRole: "TENANT_ADMIN",
      body: t.Object({
        enabled: t.Optional(
          t.Boolean({ description: "Whether Langfuse tracing is enabled." }),
        ),
        credentialRef: t.Optional(
          t.Nullable(
            t.String({
              description:
                "Vault entry reference for the Langfuse credential (null clears it).",
            }),
          ),
        ),
        sendContent: t.Optional(
          t.Boolean({
            description: "Whether message content is sent to Langfuse.",
          }),
        ),
        debug: t.Optional(
          t.Boolean({
            description:
              "Debug mode: also send the full tool schemas to every trace (heavy; tool names are always sent).",
          }),
        ),
      }),
      detail: doc(
        "Update Langfuse settings",
        "Updates the tenant's Langfuse tracing configuration.",
      ),
      response: errors(400, 401, 403),
    },
  )
  .post(
    "/langfuse/test",
    async ({ tenantContext, body }) => {
      // Enforce TENANT_ADMIN + a tenant target, then probe with the supplied (unsaved) keys. The
      // outcome (ok / invalid_credentials / unreachable) is returned as data, not thrown.
      ctxOrThrow(tenantContext);
      return testLangfuseConnection({
        publicKey: body.publicKey,
        secretKey: body.secretKey,
        baseUrl: body.baseUrl ?? null,
      });
    },
    {
      requireRole: "TENANT_ADMIN",
      body: t.Object({
        publicKey: t.String({
          minLength: 1,
          description: "Langfuse public key (pk-lf-...).",
        }),
        secretKey: t.String({
          minLength: 1,
          description: "Langfuse secret key (sk-lf-...).",
        }),
        baseUrl: t.Optional(
          t.Union([t.String(), t.Null()], {
            description: "Instance base URL (defaults to Langfuse Cloud).",
          }),
        ),
      }),
      detail: doc(
        "Test Langfuse connection",
        "Probes the Langfuse instance with the supplied keys without saving them.",
      ),
      response: errors(400, 401, 403),
    },
  );
