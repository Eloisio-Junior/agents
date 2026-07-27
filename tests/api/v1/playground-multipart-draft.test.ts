import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";

// Regression for the playground audio/file endpoints. Elysia's multipart parser auto-parses any
// form field whose value starts with `{`/`[` and is valid JSON into an object (see
// adapter/web-standard formData). The live-edit `draft` rides multipart as `JSON.stringify(...)`,
// so it arrives ALREADY as an object — typing it `t.String()` 422s ("Expected string but found
// [object Object]"). The body schema must accept the object (union with string for the malformed-
// JSON degrade path). This mirrors the schema in src/api/v1/agents.controller.ts.
const playgroundDraftSchema = t.Object({
  systemPrompt: t.Optional(t.String({ maxLength: 50_000 })),
  modelConfig: t.Optional(t.Record(t.String(), t.Unknown())),
  settings: t.Optional(t.Record(t.String(), t.Unknown())),
});

const app = new Elysia().post(
  "/upload",
  ({ body }) => {
    const draft = (body as { draft?: unknown }).draft;
    return { draftType: draft === undefined ? "undefined" : typeof draft };
  },
  {
    body: t.Object({
      file: t.File(),
      threadId: t.Optional(t.String()),
      draft: t.Optional(t.Union([t.String(), playgroundDraftSchema])),
      forceAudio: t.Optional(t.String()),
    }),
  },
);

function buildForm(draft?: unknown): FormData {
  const fd = new FormData();
  fd.append(
    "file",
    new File([new Uint8Array([1, 2, 3])], "note.webm", { type: "audio/webm" }),
  );
  fd.append("threadId", "1:playground:2074:1e191d1b");
  fd.append("forceAudio", "undefined");
  if (draft !== undefined) fd.append("draft", JSON.stringify(draft));
  return fd;
}

describe("playground multipart draft schema", () => {
  test("a JSON-stringified draft validates and arrives as an object (auto-parsed)", async () => {
    const res = await app.handle(
      new Request("http://localhost/upload", {
        method: "POST",
        body: buildForm({
          systemPrompt: "",
          modelConfig: { provider: "openai", model: "gpt-5.4-mini" },
          settings: { tts: { mode: "mirror" } },
        }),
      }),
    );
    expect(res.status).toBe(200);
    // The parser turned the `{`-leading field into an object before validation — exactly why
    // t.String() would reject it.
    expect((await res.json()).draftType).toBe("object");
  });

  test("absent draft still validates (override is optional)", async () => {
    const res = await app.handle(
      new Request("http://localhost/upload", {
        method: "POST",
        body: buildForm(undefined),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).draftType).toBe("undefined");
  });
});

// The two-step audio flow sends the step-1 transcription to the step-2 turn so STT runs once. The
// transcription is arbitrary speech text that might start with `{`/`[`; sent raw, the multipart
// parser would auto-parse it into an object and the t.String() field would 422. The client
// JSON-encodes it (always a quoted string ⇒ never auto-parsed), and the server JSON.parses it back.
const decode = (raw: unknown): string | undefined => {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
};

const turnApp = new Elysia().post(
  "/turn",
  ({ body }) => ({
    transcription: decode((body as { transcription?: string }).transcription),
  }),
  {
    body: t.Object({
      file: t.File(),
      transcription: t.Optional(t.String()),
    }),
  },
);

function turnForm(transcription?: string): FormData {
  const fd = new FormData();
  fd.append(
    "file",
    new File([new Uint8Array([1])], "note.webm", { type: "audio/webm" }),
  );
  // Mirrors the client: JSON-encode the transcription so a bracket-leading value isn't auto-parsed.
  if (transcription !== undefined) {
    fd.append("transcription", JSON.stringify(transcription));
  }
  return fd;
}

describe("playground multipart transcription field", () => {
  test("a bracket-leading transcription round-trips intact (JSON-encoded ⇒ not auto-parsed)", async () => {
    const original = "[música] olá, tudo bem?";
    const res = await turnApp.handle(
      new Request("http://localhost/turn", {
        method: "POST",
        body: turnForm(original),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).transcription).toBe(original);
  });

  test("absent transcription decodes to undefined (server then transcribes)", async () => {
    const res = await turnApp.handle(
      new Request("http://localhost/turn", {
        method: "POST",
        body: turnForm(undefined),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).transcription).toBeUndefined();
  });
});

// The file flow's step-2 turn carries a precomputed extraction: `kind` (a known enum, safe as a
// plain field) + `extracted` (arbitrary text, JSON-encoded like the transcription).
const fileTurnApp = new Elysia().post(
  "/file-turn",
  ({ body }) => {
    const b = body as { kind?: string; extracted?: string };
    const kind =
      b.kind === "image" || b.kind === "document" || b.kind === "unsupported"
        ? b.kind
        : undefined;
    return { kind, extracted: decode(b.extracted) };
  },
  {
    body: t.Object({
      file: t.File(),
      kind: t.Optional(t.String()),
      extracted: t.Optional(t.String()),
    }),
  },
);

describe("playground multipart file extraction fields", () => {
  test("kind passes through and a bracket-leading extraction round-trips", async () => {
    const fd = new FormData();
    fd.append(
      "file",
      new File([new Uint8Array([1])], "doc.pdf", { type: "application/pdf" }),
    );
    fd.append("kind", "document");
    fd.append("extracted", JSON.stringify("[tabela] total: 10"));
    const res = await fileTurnApp.handle(
      new Request("http://localhost/file-turn", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.kind).toBe("document");
    expect(out.extracted).toBe("[tabela] total: 10");
  });
});
