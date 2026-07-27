import { describe, expect, test } from "bun:test";
import { getSttProvider, SttError } from "@/modules/stt/providers";

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const audio = new ArrayBuffer(8);

describe("STT providers", () => {
  test("openai posts multipart to /audio/transcriptions with a Bearer key", async () => {
    const { calls, fetchImpl } = mockFetch({ text: "olá mundo" });
    const provider = getSttProvider("openai");
    const text = await provider?.transcribe({
      audio,
      mimeType: "audio/ogg",
      language: "pt",
      model: "whisper-1",
      apiKey: "sk-x",
      baseURL: null,
      fetchImpl,
    });
    expect(text).toBe("olá mundo");
    expect(calls[0]?.url).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-x");
    const form = calls[0]?.init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("language")).toBe("pt");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  test("openai-compatible honors a custom baseURL", async () => {
    const { calls, fetchImpl } = mockFetch({ text: "hi" });
    const provider = getSttProvider("openai-compatible");
    await provider?.transcribe({
      audio,
      mimeType: "audio/mpeg",
      language: "en",
      model: "whisper-large-v3",
      apiKey: "gsk",
      baseURL: "https://api.groq.com/openai/v1",
      fetchImpl,
    });
    expect(calls[0]?.url).toBe(
      "https://api.groq.com/openai/v1/audio/transcriptions",
    );
  });

  test("elevenlabs posts to /speech-to-text with xi-api-key + model_id", async () => {
    const { calls, fetchImpl } = mockFetch({ text: "transcrição" });
    const provider = getSttProvider("elevenlabs");
    const text = await provider?.transcribe({
      audio,
      mimeType: "audio/ogg",
      language: "pt",
      model: "scribe_v1",
      apiKey: "xi",
      baseURL: null,
      fetchImpl,
    });
    expect(text).toBe("transcrição");
    expect(calls[0]?.url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("xi");
    const form = calls[0]?.init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v1");
    expect(form.get("language_code")).toBe("pt");
  });

  test("gemini posts inline audio to generateContent and reads the candidate text", async () => {
    const { calls, fetchImpl } = mockFetch({
      candidates: [{ content: { parts: [{ text: "olá do gemini" }] } }],
    });
    const provider = getSttProvider("gemini");
    const text = await provider?.transcribe({
      audio,
      mimeType: "audio/ogg",
      language: "pt",
      model: "gemini-2.0-flash",
      apiKey: "g-key",
      baseURL: null,
      fetchImpl,
    });
    expect(text).toBe("olá do gemini");
    expect(calls[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    );
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("g-key");
    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/ogg");
    expect(typeof body.contents[0].parts[1].inline_data.data).toBe("string");
  });

  test("a non-2xx response throws SttError without leaking the body", async () => {
    const { fetchImpl } = mockFetch({ error: "secret detail" }, 401);
    const provider = getSttProvider("openai");
    const p = provider?.transcribe({
      audio,
      mimeType: "audio/ogg",
      language: "pt",
      model: "whisper-1",
      apiKey: "bad",
      baseURL: null,
      fetchImpl,
    });
    await expect(p).rejects.toBeInstanceOf(SttError);
    await expect(p).rejects.toThrow("401");
  });

  test("unknown provider resolves to null", () => {
    expect(getSttProvider("bogus")).toBeNull();
  });

  test("openrouter posts JSON with base64 input_audio to /audio/transcriptions", async () => {
    const { calls, fetchImpl } = mockFetch({ text: "olá da openrouter" });
    const provider = getSttProvider("openrouter");
    const text = await provider?.transcribe({
      audio,
      mimeType: "audio/ogg",
      language: "pt",
      model: "openai/whisper-1",
      apiKey: "sk-or",
      baseURL: null,
      fetchImpl,
    });
    expect(text).toBe("olá da openrouter");
    expect(calls[0]?.url).toBe(
      "https://openrouter.ai/api/v1/audio/transcriptions",
    );
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-or");
    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body.model).toBe("openai/whisper-1");
    expect(body.input_audio.format).toBe("ogg");
    expect(body.language).toBe("pt");
    expect(typeof body.input_audio.data).toBe("string");
  });
});
