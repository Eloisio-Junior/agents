import { TTS_PROVIDER_NAMES } from "./providers";

// Per-agent text-to-speech (audio reply) configuration, read from `agent.settings.tts`. The reply
// MODE is the headline control (the operator's three choices, mirroring the n8n flow):
//   * "never"      → always reply in text (default; audio is opt-in / costs money);
//   * "mirror"     → reply in audio whenever the customer sent audio;
//   * "preference" → follow the per-contact preference (Contact.voiceReply), falling back to mirror
//                    while it is unknown.
// Provider is selectable (ElevenLabs / OpenAI, extensible) and the API key is a vault entry
// referenced by a stable `vault:<id>` ref (renaming the secret never breaks the agent).

export type TtsMode = "never" | "mirror" | "preference";

export interface TtsConfig {
  mode: TtsMode;
  provider: string;
  model: string; // "" → provider default
  voice: string; // "" → provider default (required by some providers, e.g. ElevenLabs)
  credentialRef: string | null; // `vault:<id>` ref of the entry holding the API key

  baseURL: string | null;
  // Light pt-BR text-for-speech normalization (currency/dates/times/abbreviations → spoken words).
  // Off by default; opt-in per agent. Plain text is still sent (no SSML). See modules/tts/normalize.ts.
  normalize: boolean;
}

export const TTS_DEFAULTS: TtsConfig = {
  mode: "never",
  provider: "openai",
  model: "",
  voice: "",
  credentialRef: null,
  baseURL: null,
  normalize: false,
};

const MODES: TtsMode[] = ["never", "mirror", "preference"];

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function readTtsConfig(settings: unknown): TtsConfig {
  const s =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).tts
      : undefined;
  if (!s || typeof s !== "object") return { ...TTS_DEFAULTS };
  const bag = s as Record<string, unknown>;
  const mode = str(bag.mode);
  const provider = str(bag.provider);
  return {
    mode: mode && MODES.includes(mode as TtsMode) ? (mode as TtsMode) : "never",
    provider:
      provider && TTS_PROVIDER_NAMES.includes(provider)
        ? provider
        : TTS_DEFAULTS.provider,
    model: str(bag.model) ?? "",
    voice: str(bag.voice) ?? "",
    credentialRef: str(bag.credentialRef),
    baseURL: str(bag.baseURL),
    normalize: typeof bag.normalize === "boolean" ? bag.normalize : false,
  };
}

// The audio-vs-text decision (pure). contactVoiceReply: true=audio, false=text, null=unknown.
export function shouldReplyWithAudio(
  mode: TtsMode,
  userSentAudio: boolean,
  contactVoiceReply: boolean | null,
): boolean {
  switch (mode) {
    case "never":
      return false;
    case "mirror":
      return userSentAudio;
    case "preference":
      if (contactVoiceReply === true) return true;
      if (contactVoiceReply === false) return false;
      return userSentAudio; // unknown → mirror
  }
}
