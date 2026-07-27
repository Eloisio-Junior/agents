// Integration catalog + the closed set of normalized inbound domain events.
//
// Deliberate scope limit: the generic inbound receptor normalizes every external payload into
// ONE OF these kinds — never arbitrary action. We are an app, not an automation platform
// (n8n-export covers arbitrary workflows). Adding an integration = a catalog entry + a pure
// mapper into these kinds + a zod schema + a registry line; nothing in the core changes.

import type { InboundAuthStrategy } from "@/../generated/prisma/client";

export const INBOUND_EVENT_KINDS = [
  "conversion",
  "status_update",
  "agent_nudge",
] as const;
export type InboundEventKind = (typeof INBOUND_EVENT_KINDS)[number];

// A mapper's pure output. externalId correlates to a thread via IntegrationExternalRef;
// dedupeKey drives idempotency. All other fields are an allowlisted, PII-bounded projection —
// `summary` is text WE normalized, never the raw external JSON (prompt-injection boundary).
export interface NormalizedInboundEvent {
  kind: InboundEventKind;
  externalId: string;
  dedupeKey: string;
  occurredAt?: Date;
  value?: number;
  currency?: string;
  status?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

// The deterministic translator for one integration: external payload → normalized event, or
// null to ignore. Pure (no DB, no network, no LLM): correlation/idempotency/dispatch happen
// in the receptor around it. Validate shape with zod inside map().
export interface InboundMapper {
  catalogType: string;
  map(raw: unknown): NormalizedInboundEvent | null;
}

export type CatalogKind = "TOOLPACK" | "MCP" | "NATIVE";

export interface CatalogEntry {
  catalogType: string;
  label: string;
  kind: CatalogKind;
  description: string;
  supportsInbound: boolean;
  // NOTE: suggested default for the UI when an operator first enables the integration; the
  // instance can override. The actual gate is per-instance (inboundAuthStrategy column).
  defaultInboundAuth: InboundAuthStrategy;
}
