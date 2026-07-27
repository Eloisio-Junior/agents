// Text-to-speech provider abstraction. Each provider has a different shape, so each gets a thin
// adapter behind one interface + registry. Adding a provider = one function + one registry entry, no
// caller changes. The API key is a vault entry; provider/voice are per-agent. WhatsApp only renders a
// recorded voice note (PTT) when the audio is **Ogg/Opus** — anything else (mp3/wav) arrives as a
// plain file attachment. openai/elevenlabs both emit Opus natively, so no server-side transcode
// (ffmpeg) is needed for them. openrouter has no Opus output (only mp3/pcm), so its replies
// necessarily arrive as a file, not a native voice note — surfaced as a warning in the editor.

const TTS_TIMEOUT_MS = 60_000;

export interface TtsRequest {
  text: string;
  voice: string; // already resolved (provider default applied by the caller)
  model: string;
  language: string;
  apiKey: string;
  baseURL: string | null;
  fetchImpl: typeof fetch;
}

export interface TtsResult {
  audio: ArrayBuffer;
  mime: string;
  fileName: string;
}

export interface TtsProvider {
  defaultModel: string;
  defaultVoice: string;
  requiresVoice?: boolean;
  requiresBaseURL?: boolean;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

export class TtsError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
  ) {
    // NOTE: never capture the response body (provider detail / billing info).
    super(`TTS ${provider} failed with ${status}`);
    this.name = "TtsError";
  }
}

// Chatwoot infers file_type "audio" from the audio/ogg mime + .ogg name, and `is_recorded_audio`
// marks it as a recording; baileys then sends it to WhatsApp as a PTT voice note.
const OGG_OPUS: Pick<TtsResult, "mime" | "fileName"> = {
  mime: "audio/ogg",
  fileName: "reply.ogg",
};

// OpenAI speech: POST /audio/speech with response_format "opus" → Ogg/Opus bytes.
async function openaiSynthesize(req: TtsRequest): Promise<TtsResult> {
  const base = (req.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await req.fetchImpl(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${req.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      input: req.text,
      voice: req.voice,
      // "opus" returns an Ogg-Opus stream (WhatsApp voice-note format); "mp3" would arrive as a file.
      response_format: "opus",
    }),
    redirect: "error",
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!res.ok) throw new TtsError("openai", res.status);
  return { audio: await res.arrayBuffer(), ...OGG_OPUS };
}

// ElevenLabs text-to-speech: POST /text-to-speech/{voice_id}?output_format=opus_48000_64 → Ogg/Opus.
// Opus output was added 2025-03; 48kHz/64kbps is ample for a voice note.
async function elevenlabsSynthesize(req: TtsRequest): Promise<TtsResult> {
  const base = (req.baseURL ?? "https://api.elevenlabs.io/v1").replace(
    /\/+$/,
    "",
  );
  const res = await req.fetchImpl(
    `${base}/text-to-speech/${encodeURIComponent(req.voice)}?output_format=opus_48000_64`,
    {
      method: "POST",
      headers: {
        "xi-api-key": req.apiKey,
        "content-type": "application/json",
        accept: "audio/ogg",
      },
      body: JSON.stringify({ text: req.text, model_id: req.model }),
      redirect: "error",
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new TtsError("elevenlabs", res.status);
  return { audio: await res.arrayBuffer(), ...OGG_OPUS };
}

// OpenRouter speech: dedicated audio API (launched 2026-05-01), POST /audio/speech. Unlike openai/
// elevenlabs it has NO Opus output option (only "mp3"/"pcm"), so the reply arrives at WhatsApp as a
// plain file attachment instead of a native voice note (PTT) — the editor surfaces this as a warning
// when the operator picks this provider (no server-side transcode, by design — see docs/tts.md).
async function openrouterSynthesize(req: TtsRequest): Promise<TtsResult> {
  const base = (req.baseURL ?? "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    "",
  );
  const res = await req.fetchImpl(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${req.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      input: req.text,
      voice: req.voice,
      response_format: "mp3",
    }),
    redirect: "error",
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!res.ok) throw new TtsError("openrouter", res.status);
  return {
    audio: await res.arrayBuffer(),
    mime: "audio/mpeg",
    fileName: "reply.mp3",
  };
}

const PROVIDERS: Record<string, TtsProvider> = {
  openai: {
    defaultModel: "gpt-4o-mini-tts",
    defaultVoice: "alloy",
    synthesize: openaiSynthesize,
  },
  elevenlabs: {
    defaultModel: "eleven_flash_v2_5",
    defaultVoice: "",
    requiresVoice: true,
    synthesize: elevenlabsSynthesize,
  },
  openrouter: {
    // Verified live end-to-end (GET /models?output_modalities=speech + a real /audio/speech call).
    // OpenRouter's speech catalog has NO openai/* entries. Picked over the (also real)
    // google/gemini-3.1-flash-tts-preview because Gemini's TTS only accepts response_format="pcm"
    // (rejects "mp3" with a 400), which would need server-side WAV wrapping; kokoro accepts "mp3"
    // directly, matching openrouterSynthesize's fixed response_format, and is the cheapest model in
    // the catalog. Voice/model namespaces are the underlying vendor's and vary per model (switching
    // model requires picking a matching voice — same caveat as elevenlabs).
    defaultModel: "hexgrad/kokoro-82m",
    defaultVoice: "af_alloy",
    synthesize: openrouterSynthesize,
  },
};

export const TTS_PROVIDER_NAMES = Object.keys(PROVIDERS);

export function getTtsProvider(name: string): TtsProvider | null {
  return PROVIDERS[name] ?? null;
}
