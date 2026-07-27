import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@/../generated/prisma/client";
import type { TenantContext } from "@/lib/tenancy";
import {
  type CalendarListDeps,
  listCredentialCalendars,
  mapCalendarListResponse,
} from "@/modules/integrations/google-calendar.service";

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
  over: Partial<CalendarListDeps> & { items?: unknown[]; status?: number } = {},
): CalendarListDeps {
  return {
    resolveEntry: async () => ({ kind: "google_oauth" }),
    resolveToken: async () => "tok",
    assertSafe: async () => undefined,
    fetchImpl: jsonFetch(over.status ?? 200, { items: over.items ?? [] }),
    ...over,
  };
}

describe("google-calendar.service — mapCalendarListResponse", () => {
  test("maps id/summary/primary/accessRole; summaryOverride wins; bad items skipped", () => {
    const out = mapCalendarListResponse({
      items: [
        { id: "a@g.com", summary: "Ana", primary: true, accessRole: "owner" },
        {
          id: "b@g.com",
          summary: "Bruno",
          summaryOverride: "Dr. Bruno",
          accessRole: "writer",
        },
        { summary: "no id" },
        "garbage",
      ],
    });
    expect(out).toEqual([
      { id: "a@g.com", summary: "Ana", primary: true, accessRole: "owner" },
      {
        id: "b@g.com",
        summary: "Dr. Bruno",
        primary: false,
        accessRole: "writer",
      },
    ]);
  });

  test("non-object / missing items → empty", () => {
    expect(mapCalendarListResponse(null)).toEqual([]);
    expect(mapCalendarListResponse({})).toEqual([]);
  });
});

describe("google-calendar.service — listCredentialCalendars", () => {
  test("happy path returns the mapped calendars", async () => {
    const out = await listCredentialCalendars(
      ctx,
      "vault:464",
      noBase,
      deps({
        items: [{ id: "primary", summary: "Me", primary: true }],
      }),
    );
    expect(out).toEqual([
      { id: "primary", summary: "Me", primary: true, accessRole: "" },
    ]);
  });

  test("a non-google credential is rejected", async () => {
    await expect(
      listCredentialCalendars(ctx, "vault:464", noBase, {
        resolveEntry: async () => ({ kind: "asaas" }),
      }),
    ).rejects.toThrow(/not a connected Google account/i);
  });

  test("a missing / other-tenant credential is rejected", async () => {
    await expect(
      listCredentialCalendars(ctx, "vault:999", noBase, {
        resolveEntry: async () => null,
      }),
    ).rejects.toThrow(/not found/i);
  });

  test("an upstream non-2xx is surfaced as an error", async () => {
    await expect(
      listCredentialCalendars(ctx, "vault:464", noBase, deps({ status: 403 })),
    ).rejects.toThrow(/HTTP 403/);
  });
});
