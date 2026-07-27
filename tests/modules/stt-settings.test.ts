import { describe, expect, test } from "bun:test";
import { readSttConfig, STT_DEFAULTS } from "@/modules/stt/settings";

describe("readSttConfig", () => {
  test("returns defaults when absent or empty", () => {
    expect(readSttConfig(undefined)).toEqual(STT_DEFAULTS);
    expect(readSttConfig({})).toEqual(STT_DEFAULTS);
    expect(readSttConfig({ stt: {} })).toEqual(STT_DEFAULTS);
  });

  test("accepts a known provider and rejects an unknown one", () => {
    expect(readSttConfig({ stt: { provider: "gemini" } }).provider).toBe(
      "gemini",
    );
    expect(readSttConfig({ stt: { provider: "elevenlabs" } }).provider).toBe(
      "elevenlabs",
    );
    expect(readSttConfig({ stt: { provider: "bogus" } }).provider).toBe(
      STT_DEFAULTS.provider,
    );
  });

  test("validates the language tag, falling back to default", () => {
    expect(readSttConfig({ stt: { language: "en" } }).language).toBe("en");
    expect(readSttConfig({ stt: { language: "pt-BR" } }).language).toBe(
      "pt-BR",
    );
    expect(readSttConfig({ stt: { language: "not a lang" } }).language).toBe(
      "pt",
    );
  });

  test("carries credentialRef, model and baseURL through", () => {
    const c = readSttConfig({
      stt: {
        provider: "openai-compatible",
        model: "whisper-large-v3",
        credentialRef: "groq-key",
        baseURL: "https://api.groq.com/openai/v1",
      },
    });
    expect(c.model).toBe("whisper-large-v3");
    expect(c.credentialRef).toBe("groq-key");
    expect(c.baseURL).toBe("https://api.groq.com/openai/v1");
  });

  test("respects enabled=false", () => {
    expect(readSttConfig({ stt: { enabled: false } }).enabled).toBe(false);
  });
});
