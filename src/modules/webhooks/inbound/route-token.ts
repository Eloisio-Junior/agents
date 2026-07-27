import { createHash, randomBytes } from "node:crypto";

// Opaque 256-bit route token for the generic inbound receptor. The plaintext is returned once
// at creation (the operator pastes it into the upstream provider); only its SHA-256 hash is
// stored (IntegrationInstance.routeTokenHash, unique). Lookup is therefore a constant-time
// B-tree probe on the hash — no linear scan over secrets, no timing oracle — and a DB dump
// never yields a usable token. Never log the plaintext.

export interface GeneratedRouteToken {
  token: string;
  hash: string;
}

export function generateRouteToken(): GeneratedRouteToken {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRouteToken(token) };
}

export function hashRouteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
