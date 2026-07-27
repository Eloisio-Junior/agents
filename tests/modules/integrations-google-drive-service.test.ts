import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@/../generated/prisma/client";
import type { TenantContext } from "@/lib/tenancy";
import {
  type DriveFolderListDeps,
  listCredentialDriveFolders,
  mapDriveFolderListResponse,
} from "@/modules/integrations/google-drive.service";

const ctx = {
  tenantId: 1n,
  userId: null,
  role: "TENANT_ADMIN",
} as TenantContext;

const noBase = undefined as unknown as PrismaClient;

function jsonFetch(status: number, json: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(json), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

// Hermetic deps: a connected google_oauth entry, a stub token, a stub Google response.
function deps(
  over: Partial<DriveFolderListDeps> & {
    files?: unknown[];
    status?: number;
  } = {},
): DriveFolderListDeps {
  return {
    resolveEntry: async () => ({ kind: "google_oauth" }),
    resolveToken: async () => "tok",
    assertSafe: async () => undefined,
    fetchImpl: jsonFetch(over.status ?? 200, { files: over.files ?? [] }),
    ...over,
  };
}

describe("google-drive.service — mapDriveFolderListResponse", () => {
  test("maps id/name; entries without id or name are skipped", () => {
    const out = mapDriveFolderListResponse({
      files: [
        { id: "f1", name: "Documentos" },
        {
          id: "f2",
          name: "Contratos",
          mimeType: "application/vnd.google-apps.folder",
        },
        { name: "no id" },
        { id: "f3" },
        { id: "f4", name: "   " },
        "garbage",
      ],
    });
    expect(out).toEqual([
      { id: "f1", name: "Documentos" },
      { id: "f2", name: "Contratos" },
    ]);
  });

  test("non-object / missing files → empty", () => {
    expect(mapDriveFolderListResponse(null)).toEqual([]);
    expect(mapDriveFolderListResponse({})).toEqual([]);
  });
});

describe("google-drive.service — listCredentialDriveFolders", () => {
  test("happy path returns the mapped folders", async () => {
    const out = await listCredentialDriveFolders(
      ctx,
      "vault:464",
      noBase,
      deps({ files: [{ id: "f1", name: "Documentos" }] }),
    );
    expect(out).toEqual([{ id: "f1", name: "Documentos" }]);
  });

  test("a non-google credential is rejected", async () => {
    await expect(
      listCredentialDriveFolders(ctx, "vault:464", noBase, {
        resolveEntry: async () => ({ kind: "asaas" }),
      }),
    ).rejects.toThrow(/not a connected Google account/i);
  });

  test("a missing / other-tenant credential is rejected", async () => {
    await expect(
      listCredentialDriveFolders(ctx, "vault:999", noBase, {
        resolveEntry: async () => null,
      }),
    ).rejects.toThrow(/not found/i);
  });

  test("a 403 surfaces an insufficient-scope hint (reconnect with read access)", async () => {
    await expect(
      listCredentialDriveFolders(
        ctx,
        "vault:464",
        noBase,
        deps({ status: 403 }),
      ),
    ).rejects.toThrow(/scope/i);
  });

  test("a generic upstream non-2xx surfaces the HTTP status", async () => {
    await expect(
      listCredentialDriveFolders(
        ctx,
        "vault:464",
        noBase,
        deps({ status: 500 }),
      ),
    ).rejects.toThrow(/HTTP 500/);
  });
});
