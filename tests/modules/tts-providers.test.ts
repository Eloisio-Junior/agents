import { describe, expect, test } from "bun:test";
import { getTtsProvider, TtsError } from "@/modules/tts/providers";
import { prepareSpeechText } from "@/modules/tts/service";

interface Call {
  url: string;
  init: RequestInit;
}

function mockAudioFetch(status = 200) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(new ArrayBuffer(32), {
      status,
      headers: { "content-type": "audio/ogg" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("prepareSpeechText", () => {
  test("strips markdown, links, emojis and collapses whitespace", () => {
    const out = prepareSpeechText(
      "**Olá!** 😀 veja [aqui](https://x.com)\n\n- item `code`",
    );
    expect(out).not.toContain("**");
    expect(out).not.toContain("😀");
    expect(out).not.toContain("https://");
    expect(out).toContain("Olá!");
    expect(out).toContain("aqui");
    expect(out).toContain("item");
  });
});

describe("TTS providers", () => {
  test("openai posts to /audio/speech and returns Ogg/Opus bytes", async () => {
    const { calls, fetchImpl } = mockAudioFetch();
    const provider = getTtsProvider("openai");
    const res = await provider?.synthesize({
      text: "olá",
      voice: "alloy",
      model: "tts-1",
      language: "",
      apiKey: "sk",
      baseURL: null,
      fetchImpl,
    });
    expect(res?.mime).toBe("audio/ogg");
    expect(res?.fileName).toBe("reply.ogg");
    expect(res?.audio.byteLength).toBe(32);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/audio/speech");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk");
    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body.voice).toBe("alloy");
    expect(body.input).toBe("olá");
    expect(body.response_format).toBe("opus"); // WhatsApp voice-note (PTT) format
  });

  test("elevenlabs posts to /text-to-speech/{voice} with xi-api-key", async () => {
    const { calls, fetchImpl } = mockAudioFetch();
    const provider = getTtsProvider("elevenlabs");
    await provider?.synthesize({
      text: "olá",
      voice: "Keren123",
      model: "eleven_flash_v2_5",
      language: "",
      apiKey: "xi",
      baseURL: null,
      fetchImpl,
    });
    expect(calls[0]?.url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/Keren123?output_format=opus_48000_64",
    );
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("xi");
    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body.model_id).toBe("eleven_flash_v2_5");
  });

  test("a non-2xx response throws TtsError", async () => {
    const { fetchImpl } = mockAudioFetch(500);
    const provider = getTtsProvider("openai");
    const p = provider?.synthesize({
      text: "x",
      voice: "alloy",
      model: "tts-1",
      language: "",
      apiKey: "sk",
      baseURL: null,
      fetchImpl,
    });
    await expect(p).rejects.toBeInstanceOf(TtsError);
  });

  test("elevenlabs requires a voice; openai has a default", () => {
    expect(getTtsProvider("elevenlabs")?.requiresVoice).toBe(true);
    expect(getTtsProvider("openai")?.defaultVoice).toBe("alloy");
    expect(getTtsProvider("bogus")).toBeNull();
  });

  test("openrouter posts to /audio/speech with mp3 (no Opus option) and returns audio/mpeg", async () => {
    const { calls, fetchImpl } = mockAudioFetch();
    const provider = getTtsProvider("openrouter");
    const res = await provider?.synthesize({
      text: "olá",
      voice: "af_alloy",
      model: "hexgrad/kokoro-82m",
      language: "",
      apiKey: "sk-or",
      baseURL: null,
      fetchImpl,
    });
    expect(res?.mime).toBe("audio/mpeg");
    expect(res?.fileName).toBe("reply.mp3");
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/audio/speech");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-or");
    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body.model).toBe("hexgrad/kokoro-82m");
    expect(body.voice).toBe("af_alloy");
    expect(body.response_format).toBe("mp3");
  });
});
