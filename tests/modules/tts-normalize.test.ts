import { describe, expect, test } from "bun:test";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { llmNormalizeForSpeech } from "@/modules/tts/normalize";

describe("llmNormalizeForSpeech", () => {
  test("returns the model's rewritten text", async () => {
    const model = new FakeListChatModel({
      responses: [
        "mil duzentos e trinta e quatro reais e cinquenta e seis centavos",
      ],
    });
    const out = await llmNormalizeForSpeech(model, "Total: R$ 1.234,56");
    expect(out).toBe(
      "mil duzentos e trinta e quatro reais e cinquenta e seis centavos",
    );
  });

  test("trims surrounding whitespace from the model output", async () => {
    const model = new FakeListChatModel({
      responses: ["  cinquenta reais \n"],
    });
    expect(await llmNormalizeForSpeech(model, "R$ 50")).toBe("cinquenta reais");
  });

  test("falls back to the original text when the model returns nothing", async () => {
    const model = new FakeListChatModel({ responses: [""] });
    expect(await llmNormalizeForSpeech(model, "olá tudo bem")).toBe(
      "olá tudo bem",
    );
  });
});
