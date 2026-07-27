import { describe, expect, test } from "bun:test";
import { isAudioMime, mcpAttachmentToFile } from "@/modules/mcp/server";

// base64 of the bytes [1, 2, 3] (a tiny non-text payload).
const TINY_B64 = Buffer.from(new Uint8Array([1, 2, 3])).toString("base64");

describe("isAudioMime", () => {
  test("audio/* and video/webm route to the voice-note path", () => {
    expect(isAudioMime("audio/ogg")).toBe(true);
    expect(isAudioMime("audio/mpeg")).toBe(true);
    expect(isAudioMime("video/webm")).toBe(true);
  });
  test("images, documents and other types route to the file path", () => {
    expect(isAudioMime("image/png")).toBe(false);
    expect(isAudioMime("application/pdf")).toBe(false);
    expect(isAudioMime("text/plain")).toBe(false);
    expect(isAudioMime("video/mp4")).toBe(false);
  });
});

describe("mcpAttachmentToFile", () => {
  test("decodes raw base64 and honors the explicit mime + filename", async () => {
    const file = await mcpAttachmentToFile({
      mime: "image/png",
      data_base64: TINY_B64,
      filename: "shot.png",
    });
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("shot.png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("accepts a full data: URL by stripping the prefix", async () => {
    const file = await mcpAttachmentToFile({
      mime: "audio/ogg",
      data_base64: `data:audio/ogg;base64,${TINY_B64}`,
    });
    expect(file.type).toBe("audio/ogg");
    // No filename → mime-derived default for an audio note.
    expect(file.name).toBe("voice-note");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("derives a sensible default filename per mime", async () => {
    expect(
      (await mcpAttachmentToFile({ mime: "image/jpeg", data_base64: TINY_B64 }))
        .name,
    ).toBe("image");
    expect(
      (
        await mcpAttachmentToFile({
          mime: "application/pdf",
          data_base64: TINY_B64,
        })
      ).name,
    ).toBe("document.pdf");
  });

  test("rejects empty / invalid base64", async () => {
    await expect(
      mcpAttachmentToFile({ mime: "image/png", data_base64: "" }),
    ).rejects.toThrow();
    await expect(
      mcpAttachmentToFile({ mime: "image/png", data_base64: "!!!" }),
    ).rejects.toThrow();
  });

  test("requires either data_base64 or url", async () => {
    await expect(mcpAttachmentToFile({ mime: "image/png" })).rejects.toThrow(
      /data_base64 or url/,
    );
  });

  test("rejects oversized payloads (>25MB)", async () => {
    // 26MB of base64-encoded zero bytes.
    const big = Buffer.alloc(26 * 1024 * 1024).toString("base64");
    await expect(
      mcpAttachmentToFile({ mime: "image/png", data_base64: big }),
    ).rejects.toThrow(/too large/);
  });
});
