import { describe, expect, test } from "bun:test";
import type { ChatOpenAI } from "@langchain/openai";
import { parseModelConfig } from "@/graph/model-config";
import { createChatModel } from "@/graph/models";

// An empty model means "the server's default" and is valid ONLY for openai-compatible
// (llama.cpp-style single-model servers ignore the requested name). Every other provider
// must name a model. Regression for the editor wipe: saving a compatible config without a
// model used to collapse the whole modelConfig to {}.
describe("modelConfig empty model", () => {
  test("rejected for openai", () => {
    expect(() => parseModelConfig({ provider: "openai", model: "" })).toThrow(
      /model is required/,
    );
  });

  test("rejected when absent for anthropic", () => {
    expect(() => parseModelConfig({ provider: "anthropic" })).toThrow(
      /model is required/,
    );
  });

  test("accepted (and defaulted to empty) for openai-compatible", () => {
    const cfg = parseModelConfig({
      provider: "openai-compatible",
      baseURL: "http://localhost:8080/v1",
    });
    expect(cfg.model).toBe("");
  });

  test("non-empty model still round-trips untouched", () => {
    const cfg = parseModelConfig({ provider: "openai", model: "gpt-5.4-mini" });
    expect(cfg.model).toBe("gpt-5.4-mini");
  });

  test("createChatModel sends the neutral placeholder for an empty compatible model", () => {
    const m = createChatModel({
      provider: "openai-compatible",
      model: "",
      apiKey: "test",
      baseURL: "http://localhost:8080/v1",
    }) as ChatOpenAI;
    expect(m.model).toBe("default");
  });

  test("createChatModel keeps an explicit compatible model as-is", () => {
    const m = createChatModel({
      provider: "openai-compatible",
      model: "/models/qwen.gguf",
      apiKey: "test",
      baseURL: "http://localhost:8080/v1",
    }) as ChatOpenAI;
    expect(m.model).toBe("/models/qwen.gguf");
  });
});
