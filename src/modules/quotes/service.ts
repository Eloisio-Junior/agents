import { z } from "zod";
import { Prisma, type PrismaClient } from "@/../generated/prisma/client";
import basePrisma from "@/api/lib/prisma";
import config from "@/config";
import { AppError, NotFoundError } from "@/lib/errors";
import { type QuoteRenderData, renderQuotePdf } from "@/lib/pdf";
import { runScopedOn, type TenantContext } from "@/lib/tenancy";

// Quote generation. Two-phase + idempotent (the hardened spec): a burst/retry/resume with the same
// idempotencyKey produces ONE quote and ONE PDF, never N links to the lead.
//   Phase A (tx): create the PENDING row race-safely (createMany skipDuplicates on the
//     [tenantId, idempotencyKey] unique) and re-read. An already-READY row is returned as-is.
//   Phase B (no tx): render the PDF (CPU-bound; outside the tx so the pool isn't pinned), write it
//     to a path DERIVED FROM THE ROW ID (deterministic → a retry overwrites, no orphan), then
//     CAS the row to READY. Serving is only ever via the authenticated, tenant-scoped route.

const quoteItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().finite().nonnegative(),
  unitPrice: z.number().finite().nonnegative(),
});

export const quoteSnapshotSchema = z.object({
  title: z.string().min(1).max(200),
  customerName: z.string().max(200).nullish(),
  currency: z.string().min(1).max(8),
  items: z.array(quoteItemSchema).min(1).max(100),
  notes: z.string().max(2_000).nullish(),
  issuedAt: z.string().max(40).optional(),
});
export type QuoteSnapshot = z.infer<typeof quoteSnapshotSchema>;

export interface GenerateQuoteParams {
  tenantId: bigint;
  idempotencyKey: string;
  snapshot: QuoteSnapshot;
  conversationId?: bigint | null;
  threadId?: string | null;
  base?: PrismaClient;
  storageDir?: string;
}

export interface QuoteResult {
  id: string;
  status: string;
}

function sysCtx(tenantId: bigint): TenantContext {
  return { tenantId, userId: null, role: "TENANT_ADMIN" };
}

function storageKey(tenantId: bigint, quoteId: bigint): string {
  return `${tenantId}/${quoteId}.pdf`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function generateQuote(
  params: GenerateQuoteParams,
): Promise<QuoteResult> {
  const base = params.base ?? basePrisma;
  const dir = params.storageDir ?? config.quotesStorageDir;
  const snapshot = quoteSnapshotSchema.parse(params.snapshot);
  const tenantId = params.tenantId;

  // Phase A: race-safe create-or-load of the PENDING row (+ the tenant name for the header,
  // read scoped so it is always the caller's own tenant).
  const loaded = await runScopedOn(base, sysCtx(tenantId), async (db) => {
    await db.quote
      .createMany({
        data: [
          {
            tenantId,
            conversationId: params.conversationId ?? null,
            threadId: params.threadId ?? null,
            idempotencyKey: params.idempotencyKey,
            snapshot: snapshot as Prisma.InputJsonValue,
            status: "PENDING",
          },
        ],
        skipDuplicates: true,
      })
      .catch((err) => {
        if (!isUniqueViolation(err)) throw err; // concurrent insert → fall through to re-read
      });
    const quote = await db.quote.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: params.idempotencyKey,
        },
      },
      select: { id: true, status: true, pdfStorageKey: true, snapshot: true },
    });
    const tenant = await db.tenant.findFirst({ select: { name: true } });
    return { quote, tenantName: tenant?.name ?? "" };
  });
  const row = loaded.quote;
  if (!row) throw new AppError("failed to persist quote", 500);
  if (row.status === "READY" && row.pdfStorageKey) {
    return { id: String(row.id), status: row.status };
  }

  // Phase B: render the stored snapshot (NOT the caller's argument — idempotent) and persist.
  const stored = quoteSnapshotSchema.parse(row.snapshot);
  const render: QuoteRenderData = {
    tenantName: loaded.tenantName,
    title: stored.title,
    customerName: stored.customerName ?? null,
    currency: stored.currency,
    items: stored.items,
    notes: stored.notes ?? null,
    issuedAt: stored.issuedAt,
  };
  const buffer = await renderQuotePdf(render);
  const key = storageKey(tenantId, row.id);
  // Bun.write creates parent directories. The path is derived from numeric ids only.
  await Bun.write(`${dir}/${key}`, buffer);

  await runScopedOn(base, sysCtx(tenantId), (db) =>
    db.quote.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "READY", pdfStorageKey: key },
    }),
  );
  return { id: String(row.id), status: "READY" };
}

export interface QuotePdf {
  bytes: ArrayBuffer;
}

// Authenticated, tenant-scoped read of a generated PDF. The scoped read is the boundary; the
// filesystem has no RLS, so the row (and thus the key) is only resolvable for the owning tenant.
export async function getQuotePdf(
  ctx: TenantContext,
  id: bigint,
  base: PrismaClient = basePrisma,
  storageDir?: string,
): Promise<QuotePdf> {
  const dir = storageDir ?? config.quotesStorageDir;
  const row = await runScopedOn(base, ctx, (db) =>
    db.quote.findUnique({
      where: { id },
      select: {
        status: true,
        pdfStorageKey: true,
        revoked: true,
        expiresAt: true,
      },
    }),
  );
  if (!row?.pdfStorageKey || row.status !== "READY") {
    throw new NotFoundError("quote not found");
  }
  if (row.revoked) throw new NotFoundError("quote not found");
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new NotFoundError("quote not found");
  }
  const file = Bun.file(`${dir}/${row.pdfStorageKey}`);
  if (!(await file.exists())) throw new NotFoundError("quote not found");
  return { bytes: await file.arrayBuffer() };
}

export interface QuoteListItem {
  id: string;
  status: string;
  title: string | null;
  currency: string | null;
  conversationId: string | null;
  threadId: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export async function listQuotes(
  ctx: TenantContext,
  opts: { limit?: number } = {},
  base: PrismaClient = basePrisma,
): Promise<QuoteListItem[]> {
  const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await runScopedOn(base, ctx, (db) =>
    db.quote.findMany({
      orderBy: { id: "desc" },
      take,
      select: {
        id: true,
        status: true,
        snapshot: true,
        conversationId: true,
        threadId: true,
        expiresAt: true,
        revoked: true,
        createdAt: true,
      },
    }),
  );
  return rows.map((r) => {
    const s = (r.snapshot ?? {}) as { title?: string; currency?: string };
    return {
      id: String(r.id),
      status: r.status,
      title: s.title ?? null,
      currency: s.currency ?? null,
      conversationId: r.conversationId ? String(r.conversationId) : null,
      threadId: r.threadId,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      revoked: r.revoked,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function revokeQuote(
  ctx: TenantContext,
  id: bigint,
  base: PrismaClient = basePrisma,
): Promise<void> {
  await runScopedOn(base, ctx, async (db) => {
    const res = await db.quote.updateMany({
      where: { id },
      data: { revoked: true },
    });
    if (res.count === 0) {
      throw new NotFoundError("quote not found", "errors.quoteNotFound");
    }
  });
}
