import logger from "@/api/lib/logger";

// Connection test for a Langfuse credential, used by the credential form's "Test connection" button
// BEFORE the keys are saved (so it takes the typed values, not a stored vault entry). Probes the
// cheap, auth-gated GET /api/public/projects (exists on both cloud and self-hosted): 200 ⇒ ok,
// 401/403 ⇒ bad keys, anything else / network failure ⇒ the instance is unreachable. Never logs the
// secret. Result is data, not an error — the caller wants to distinguish the outcomes in the UI.

export interface LangfuseTestResult {
  ok: boolean;
  reason?: "invalid_credentials" | "unreachable";
  status?: number;
}

export async function testLangfuseConnection(
  input: { publicKey: string; secretKey: string; baseUrl?: string | null },
  fetchFn: typeof fetch = fetch,
): Promise<LangfuseTestResult> {
  const base = (input.baseUrl?.trim() || "https://cloud.langfuse.com").replace(
    /\/+$/,
    "",
  );
  const credentials = Buffer.from(
    `${input.publicKey}:${input.secretKey}`,
  ).toString("base64");
  try {
    const res = await fetchFn(`${base}/api/public/projects`, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "invalid_credentials", status: res.status };
    }
    return { ok: false, reason: "unreachable", status: res.status };
  } catch (err) {
    logger.warn({ err }, "langfuse connection test failed");
    return { ok: false, reason: "unreachable" };
  }
}
