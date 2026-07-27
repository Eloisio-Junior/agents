import type { TFunction } from "i18next";

// Brand names are hardcoded (not i18n-translated) for well-known providers.
// openai-compatible is the only one that warrants translation.
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google (Gemini)",
  // STT/vision use the key `gemini` (not `google`) for the same vendor; STT/TTS add `elevenlabs`.
  gemini: "Google (Gemini)",
  elevenlabs: "ElevenLabs",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
};

export function providerLabel(p: string, t: TFunction): string {
  if (p === "openai-compatible") {
    return t("editor.providerOpenAiCompatible", "OpenAI-compatible");
  }
  return PROVIDER_LABELS[p] ?? p;
}

// Sensible per-provider default, auto-applied when the operator switches provider so the form
// never sits on a model id that belongs to another provider. openai-compatible has no guessable
// default (empty clears the field; the picker lists the endpoint's models). Ids age with provider
// releases — revisit alongside DEFAULT_MODEL_CONFIG in src/graph/model-config.ts.
export const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-3.5-flash",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-5.4-mini",
  "openai-compatible": "",
};
