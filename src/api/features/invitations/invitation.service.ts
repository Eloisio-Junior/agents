import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, UserRole } from "@/../generated/prisma/client";
import type { ManageableRole } from "@/api/features/admin/admin.service";
import { hashPassword } from "@/api/features/auth/auth.service";
import type { AuthUser } from "@/api/lib/auth";
import basePrisma from "@/api/lib/prisma";

// User-invitation flow (adapted from the sibling app's single-tenant invite system to our
// multi-tenant model). Security invariants:
//   - the token is HASHED at rest (sha256); the plaintext is returned ONCE (the inviter pastes a
//     copyable link — there is no mailer). A DB dump never yields a usable token.
//   - the `invitations` table is GLOBAL (no RLS): every read/write here MUST carry an explicit
//     tenant scope (tenantScope), exactly like admin.service does for `users`. A forgotten filter
//     leaks/edits cross-tenant invites with no DB backstop.
//   - role is bound to the invite ROW; SUPER_ADMIN is never invitable (ManageableRole + a DB CHECK).
//   - acceptInvite binds tenantId + role from the persisted invite, NEVER from the request, and is
//     single-use via a compare-and-set consume.
// `base` is injectable so integration tests pass their own (real) client instead of the singleton.

const INVITE_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Same tenant-scoping convention as admin.service: null tenantId = SUPER_ADMIN (fleet-wide).
function tenantScope(tenantId: bigint | null) {
  return tenantId === null ? {} : { tenantId };
}

export type InviteStatus = "pending" | "consumed" | "expired";

function inviteStatus(row: {
  consumedAt: Date | null;
  expiresAt: Date;
}): InviteStatus {
  if (row.consumedAt) return "consumed";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

export class InviteEmailInUseError extends Error {
  constructor() {
    super("A user with this email already exists in this tenant");
    this.name = "InviteEmailInUseError";
  }
}

export class InviteInvalidError extends Error {
  constructor() {
    super("Invitation is invalid, expired, or already used");
    this.name = "InviteInvalidError";
  }
}

export class InviteNotFoundError extends Error {
  constructor() {
    super("Invitation not found");
    this.name = "InviteNotFoundError";
  }
}

async function emailExistsInTenant(
  base: PrismaClient,
  email: string,
  tenantId: bigint,
): Promise<boolean> {
  const existing = await base.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, tenantId },
    select: { id: true },
  });
  return existing !== null;
}

export interface CreateInviteParams {
  tenantId: bigint;
  email: string;
  role: ManageableRole;
  invitedById: bigint | null;
  ttlDays?: number;
}

export interface CreatedInvite {
  id: bigint;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: Date;
}

// Mints (or rotates) an invite for (tenantId, email). The caller resolves tenantId + role per the
// principal (a TENANT_ADMIN is forced to its own tenant; a SUPER_ADMIN targets any). Returns the
// plaintext token ONCE.
export async function createInvite(
  params: CreateInviteParams,
  base: PrismaClient = basePrisma,
): Promise<CreatedInvite> {
  // Defense-in-depth (ManageableRole already excludes it; the DB CHECK is the last line).
  if ((params.role as UserRole) === "SUPER_ADMIN") {
    throw new InviteInvalidError();
  }
  const email = params.email.trim().toLowerCase();
  if (await emailExistsInTenant(base, email, params.tenantId)) {
    throw new InviteEmailInUseError();
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + (params.ttlDays ?? INVITE_TTL_DAYS) * DAY_MS,
  );
  const row = await base.invitation.upsert({
    where: { tenantId_email: { tenantId: params.tenantId, email } },
    create: {
      tenantId: params.tenantId,
      email,
      role: params.role,
      tokenHash,
      invitedById: params.invitedById,
      expiresAt,
    },
    // Re-invite rotates the token/role/expiry and clears any prior consumption.
    update: {
      role: params.role,
      tokenHash,
      invitedById: params.invitedById,
      expiresAt,
      consumedAt: null,
    },
    select: { id: true, email: true, role: true },
  });
  return { id: row.id, email: row.email, role: row.role, token, expiresAt };
}

export interface InviteListItem {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
}

export async function listInvites(
  tenantId: bigint | null,
  base: PrismaClient = basePrisma,
): Promise<InviteListItem[]> {
  const rows = await base.invitation.findMany({
    where: tenantScope(tenantId),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      tenantId: true,
      consumedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    email: r.email,
    role: r.role,
    tenantId: r.tenantId.toString(),
    status: inviteStatus(r),
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

// Hard-delete, tenant-scoped (count 0 → out-of-scope/non-existent → NotFound, never cross-tenant).
export async function revokeInvite(
  tenantId: bigint | null,
  id: bigint,
  base: PrismaClient = basePrisma,
): Promise<void> {
  const res = await base.invitation.deleteMany({
    where: { id, ...tenantScope(tenantId) },
  });
  if (res.count === 0) throw new InviteNotFoundError();
}

export interface ValidatedInvite {
  email: string;
  role: UserRole;
}

// Pre-fill lookup for the accept page. Returns null (generic) for missing/consumed/expired so the
// endpoint cannot distinguish live from dead tokens.
export async function findValidInviteByToken(
  token: string,
  base: PrismaClient = basePrisma,
): Promise<ValidatedInvite | null> {
  const row = await base.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { email: true, role: true, consumedAt: true, expiresAt: true },
  });
  if (!row || inviteStatus(row) !== "pending") return null;
  return { email: row.email, role: row.role };
}

export interface AcceptInviteParams {
  token: string;
  password: string;
  name?: string | null;
}

const AUTH_USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  name: true,
  role: true,
  googleId: true,
} as const;

// Consumes an invite and creates the user. tenantId + role come from the ROW (never the request).
// Single-use via CAS consume in the same transaction as the user insert; the (tenant, lower(email))
// unique index is the DB backstop against a duplicate account.
export async function acceptInvite(
  params: AcceptInviteParams,
  base: PrismaClient = basePrisma,
): Promise<AuthUser> {
  const tokenHash = hashToken(params.token);
  const invite = await base.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      tenantId: true,
      email: true,
      role: true,
      consumedAt: true,
      expiresAt: true,
    },
  });
  if (!invite || inviteStatus(invite) !== "pending") {
    throw new InviteInvalidError();
  }
  if (await emailExistsInTenant(base, invite.email, invite.tenantId)) {
    throw new InviteEmailInUseError();
  }
  const passwordHash = await hashPassword(params.password);

  return base.$transaction(async (tx) => {
    // CAS consume: a concurrent/replayed accept sees count 0 and is rejected (single-use).
    const consumed = await tx.invitation.updateMany({
      where: { id: invite.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw new InviteInvalidError();
    return tx.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name: params.name?.trim() || null,
        tenantId: invite.tenantId,
        role: invite.role,
        // Accept auto-logs-in; stamp lastLoginAt so the Google-link block doesn't trip later.
        lastLoginAt: new Date(),
      },
      select: AUTH_USER_SELECT,
    });
  });
}
