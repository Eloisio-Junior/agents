import { describe, expect, test } from "bun:test";
import { parseLangfuseEnv } from "@/client/components/CredentialForm";
import { testLangfuseConnection } from "@/modules/analytics/langfuse-test";

const fakeFetch = (impl: (url: string, init: RequestInit) => Response) =>
  (async (url: string, init: RequestInit) =>
    impl(url, init)) as unknown as typeof fetch;

describe("testLangfuseConnection", () => {
  test("200 → ok", async () => {
    const res = await testLangfuseConnection(
      { publicKey: "pk", secretKey: "sk", baseUrl: "https://lf.example.com" },
      fakeFetch(() => new Response(null, { status: 200 })),
    );
    expect(res).toEqual({ ok: true });
  });

  test("401 → invalid_credentials", async () => {
    const res = await testLangfuseConnection(
      { publicKey: "pk", secretKey: "bad" },
      fakeFetch(() => new Response(null, { status: 401 })),
    );
    expect(res).toEqual({
      ok: false,
      reason: "invalid_credentials",
      status: 401,
    });
  });

  test("500 → unreachable", async () => {
    const res = await testLangfuseConnection(
      { publicKey: "pk", secretKey: "sk" },
      fakeFetch(() => new Response(null, { status: 500 })),
    );
    expect(res).toEqual({ ok: false, reason: "unreachable", status: 500 });
  });

  test("network error → unreachable", async () => {
    const res = await testLangfuseConnection(
      { publicKey: "pk", secretKey: "sk" },
      (async () => {
        throw new Error("boom");
      }) as unknown as typeof fetch,
    );
    expect(res).toEqual({ ok: false, reason: "unreachable" });
  });

  test("hits /api/public/projects on the base with Basic auth (trims trailing slash)", async () => {
    let url = "";
    let auth = "";
    await testLangfuseConnection(
      {
        publicKey: "pub",
        secretKey: "sec",
        baseUrl: "https://lf.example.com/",
      },
      fakeFetch((u, init) => {
        url = u;
        auth = (init.headers as Record<string, string>).Authorization ?? "";
        return new Response(null, { status: 200 });
      }),
    );
    expect(url).toBe("https://lf.example.com/api/public/projects");
    expect(auth).toBe(`Basic ${Buffer.from("pub:sec").toString("base64")}`);
  });

  test("defaults to Langfuse Cloud when no base URL is given", async () => {
    let url = "";
    await testLangfuseConnection(
      { publicKey: "pub", secretKey: "sec" },
      fakeFetch((u) => {
        url = u;
        return new Response(null, { status: 200 });
      }),
    );
    expect(url).toBe("https://cloud.langfuse.com/api/public/projects");
  });
});

describe("parseLangfuseEnv", () => {
  test("parses a full .env block (quoted, export-prefixed)", () => {
    const text = [
      'LANGFUSE_SECRET_KEY="sk-lf-123"',
      "export LANGFUSE_PUBLIC_KEY='pk-lf-456'",
      "LANGFUSE_BASE_URL=https://langfuse.example.com",
    ].join("\n");
    expect(parseLangfuseEnv(text)).toEqual({
      publicKey: "pk-lf-456",
      secretKey: "sk-lf-123",
      baseUrl: "https://langfuse.example.com",
    });
  });

  test("accepts LANGFUSE_HOST as the base URL", () => {
    expect(parseLangfuseEnv("LANGFUSE_HOST=https://lf.local")).toEqual({
      baseUrl: "https://lf.local",
    });
  });

  test("returns null when nothing is recognized", () => {
    expect(parseLangfuseEnv("FOO=bar\nnot an env line")).toBeNull();
  });

  test("recognizes a partial paste (only the public key)", () => {
    expect(parseLangfuseEnv("LANGFUSE_PUBLIC_KEY=pk-lf-1")).toEqual({
      publicKey: "pk-lf-1",
    });
  });
});
