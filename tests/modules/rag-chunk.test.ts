import { describe, expect, test } from "bun:test";
import { chunkText } from "@/modules/rag/chunk";

describe("chunkText", () => {
  test("empty/whitespace → []", async () => {
    expect(await chunkText("   ")).toEqual([]);
  });
  test("short text → single chunk", async () => {
    const out = await chunkText("Olá, tudo bem?");
    expect(out).toEqual(["Olá, tudo bem?"]);
  });
  test("long text → multiple overlapping chunks", async () => {
    const para = "Lorem ipsum dolor sit amet. ".repeat(200);
    const out = await chunkText(para, { chunkSize: 200, chunkOverlap: 40 });
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.length <= 220)).toBe(true);
  });
});
