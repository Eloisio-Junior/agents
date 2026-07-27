import { MODEL_PROVIDERS, type ModelConfig } from "@/graph/model-config";

// Per-agent guardrails (input/output moderation) config, read from `agent.settings.guardrails`. A
// dedicated LLM "guardrails agent" (its OWN selectable chat model, separate from the main agent's)
// analyzes the customer message (input) and/or the agent reply (output) against a set of standard
// checks; on a violation the configured PER-DIRECTION action fires (template reply / a guardrails-
// generated safe reply / stay silent). This reader is the single source of defaults + clamping, so a
// malformed value never breaks the webhook. Surfaced in the agent editor. Off by default.

export type GuardrailAction = "template" | "generated" | "silent";
export const GUARDRAIL_ACTIONS: readonly GuardrailAction[] = [
  "template",
  "generated",
  "silent",
];

export interface GuardrailChecks {
  // Harassment, hate speech, insults, or abusive/threatening language.
  toxicity: boolean;
  // Sexual content, graphic violence, illegal/dangerous acts, or self-harm.
  unsafeContent: boolean;
  // Mentions/recommendations of the configured competitor names.
  competitorMentions: boolean;
  // (output only) the reply stays within the scope/persona set by the agent's instructions.
  promptAdherence: boolean;
}

export interface GuardrailDirectionConfig {
  enabled: boolean;
  checks: GuardrailChecks;
  // What to do on a violation: send `templateMessage` verbatim, send a guardrails-generated safe
  // reply, or stay silent (send nothing). Default "template".
  action: GuardrailAction;
  // The static reply used when action === "template".
  templateMessage: string;
  // Steering prompt for action === "generated": guides HOW the guardrails agent writes the
  // replacement reply (tone, what to offer, what to avoid). Empty → generic safe reply.
  generationPrompt: string;
}

export interface GuardrailsConfig {
  enabled: boolean;
  // The guardrails agent's own chat model (separate from the main agent's model).
  provider: ModelConfig["provider"];
  model: string; // "" → provider default (only valid for openai-compatible)
  credentialRef: string | null; // `vault:<id>` ref of the entry holding the API key
  baseURL: string | null; // for openai-compatible / self-hosted endpoints
  // Configurable competitor names for the competitorMentions check.
  competitors: string[];
  // Free-text extra policy appended to every analysis prompt.
  customPolicy: string;
  input: GuardrailDirectionConfig;
  output: GuardrailDirectionConfig;
}

const DEFAULT_TEMPLATE = "Desculpe, não consigo ajudar com isso.";

export const GUARDRAILS_DEFAULTS: GuardrailsConfig = {
  enabled: false,
  provider: "openai",
  model: "",
  credentialRef: null,
  baseURL: null,
  competitors: [],
  customPolicy: "",
  input: {
    enabled: true,
    checks: {
      toxicity: true,
      unsafeContent: true,
      competitorMentions: false,
      promptAdherence: false,
    },
    action: "template",
    templateMessage: DEFAULT_TEMPLATE,
    generationPrompt: "",
  },
  output: {
    enabled: true,
    checks: {
      toxicity: true,
      unsafeContent: true,
      competitorMentions: true,
      promptAdherence: true,
    },
    action: "template",
    templateMessage: DEFAULT_TEMPLATE,
    generationPrompt: "",
  },
};

const MAX_TEMPLATE = 2000;
const MAX_GENERATION_PROMPT = 2000;
const MAX_POLICY = 2000;
const MAX_COMPETITORS = 50;
const MAX_COMPETITOR_LEN = 100;

function bool(v: unknown, d: boolean): boolean {
  return typeof v === "boolean" ? v : d;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readChecks(v: unknown, d: GuardrailChecks): GuardrailChecks {
  const b = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    toxicity: bool(b.toxicity, d.toxicity),
    unsafeContent: bool(b.unsafeContent, d.unsafeContent),
    competitorMentions: bool(b.competitorMentions, d.competitorMentions),
    promptAdherence: bool(b.promptAdherence, d.promptAdherence),
  };
}

function readAction(v: unknown): GuardrailAction {
  return typeof v === "string" &&
    GUARDRAIL_ACTIONS.includes(v as GuardrailAction)
    ? (v as GuardrailAction)
    : "template";
}

function readDirection(
  v: unknown,
  d: GuardrailDirectionConfig,
): GuardrailDirectionConfig {
  const b = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    enabled: bool(b.enabled, d.enabled),
    checks: readChecks(b.checks, d.checks),
    action: readAction(b.action),
    templateMessage: (str(b.templateMessage) ?? d.templateMessage).slice(
      0,
      MAX_TEMPLATE,
    ),
    generationPrompt: (str(b.generationPrompt) ?? d.generationPrompt).slice(
      0,
      MAX_GENERATION_PROMPT,
    ),
  };
}

function readCompetitors(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s) out.push(s.slice(0, MAX_COMPETITOR_LEN));
    if (out.length >= MAX_COMPETITORS) break;
  }
  return out;
}

export function readGuardrailsConfig(settings: unknown): GuardrailsConfig {
  const s =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).guardrails
      : undefined;
  if (!s || typeof s !== "object") return structuredClone(GUARDRAILS_DEFAULTS);
  const bag = s as Record<string, unknown>;
  const provider = str(bag.provider);
  return {
    enabled: bool(bag.enabled, GUARDRAILS_DEFAULTS.enabled),
    provider:
      provider && (MODEL_PROVIDERS as readonly string[]).includes(provider)
        ? (provider as ModelConfig["provider"])
        : GUARDRAILS_DEFAULTS.provider,
    model: str(bag.model) ?? "",
    credentialRef: str(bag.credentialRef),
    baseURL: str(bag.baseURL),
    competitors: readCompetitors(bag.competitors),
    customPolicy: (str(bag.customPolicy) ?? "").slice(0, MAX_POLICY),
    input: readDirection(bag.input, GUARDRAILS_DEFAULTS.input),
    output: readDirection(bag.output, GUARDRAILS_DEFAULTS.output),
  };
}
