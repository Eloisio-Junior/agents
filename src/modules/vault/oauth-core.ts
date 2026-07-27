import { createHash, randomBytes } from "node:crypto";
import { decryptJson, encryptJson } from "@/api/lib/crypto";

// Provider-agnostic OAuth 2.1 primitives shared by the vault OAuth credential kinds (google_oauth,
// mcp_oauth): PKCE, encrypted opaque state, and the CSP-safe consent-popup callback HTML. Anything
// provider-specific (fixed endpoints, scope validation, token refresh) lives in the per-provider
// module (google-oauth.ts, mcp-oauth.ts).

// ── base64url / PKCE (RFC 7636) ──

// URL-safe base64 with no padding.
export function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// 43-char verifier (32 random bytes), within the RFC 7636 43-128 range.
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function computeCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

// A short random nonce for opaque-state freshness.
export function newNonce(): string {
  return base64url(randomBytes(12));
}

// ── encrypted opaque state ──

// The OAuth `state` is an encrypted blob, opaque to the browser. encrypt is generic; each provider
// decrypts with its own shape validation (decryptJson here returns the raw object, unchecked).
export function encryptOAuthState<T>(data: T): string {
  return encryptJson(data);
}

export function decryptOAuthStateRaw<T>(blob: string): T {
  return decryptJson<T>(blob);
}

// ── callback HTML (CSP-safe) ──

// The executable script is a FIXED string (no interpolated content), so its sha256 can be pinned in
// the CSP script-src ONCE (see csp.ts) and reused by every OAuth consent popup. All per-render data
// — including the BroadcastChannel name and the message `type` — rides in a non-executable
// application/json block the script reads at runtime, so the script text never varies across
// providers. The script only forwards `cfg.channel` / `cfg.type` to BroadcastChannel()/postMessage()
// (no eval, no DOM injection), so it stays CSP-safe.
export const OAUTH_CALLBACK_SCRIPT = `
      var cfg = JSON.parse(document.getElementById('cfg').textContent);
      var msg = { type: cfg.type, ok: cfg.ok, message: cfg.message };
      try { new BroadcastChannel(cfg.channel).postMessage(msg); } catch (e) {}
      if (cfg.origin) { try { window.opener && window.opener.postMessage(msg, cfg.origin); } catch (e) {} }
      setTimeout(function () { try { window.close(); } catch (e) {} }, 2000);
    `;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface OAuthCallbackHtmlParams {
  ok: boolean;
  message: string;
  // The opener window's origin for the postMessage; empty disables the opener postMessage (the
  // BroadcastChannel still works for same-origin popups).
  targetOrigin: string;
  // The BroadcastChannel name + message `type` the SPA listens on (e.g. "oauth-google" /
  // "google-oauth", "oauth-mcp" / "mcp-oauth").
  channel: string;
  type: string;
  // The document <title> (fixed per provider; escaped defensively).
  title: string;
}

// Embeds the per-render config as JSON inside a <script type="application/json"> block (safe: not
// executable, needs no CSP hash) and renders the FIXED executable script.
export function buildOAuthCallbackHtml(
  params: OAuthCallbackHtmlParams,
): string {
  // JSON inside a <script> block must not contain a literal `</script>`; escape the slash.
  const cfg = JSON.stringify({
    ok: params.ok,
    message: params.message,
    origin: params.targetOrigin,
    channel: params.channel,
    type: params.type,
  }).replace(/<\//g, "<\\/");
  const okIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const errIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  const heading = params.ok ? "Conexão concluída" : "Não foi possível conectar";
  const detail = params.ok
    ? "Você já pode fechar esta janela."
    : escapeHtml(params.message);
  const hint = params.ok
    ? "Connection complete — you can close this window."
    : "Connection failed — you can close this window.";
  // Inline <style> is CSP-allowed (style-src carries 'unsafe-inline'); the ONLY executable script is
  // the pinned OAUTH_CALLBACK_SCRIPT, so styling the page never changes its hash. No external
  // resources (system fonts + inline SVG) so it renders standalone in the popup.
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(params.title)}</title>
<style>
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;padding:24px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:#f4f5f7;color:#1c1e21}
  .card{width:100%;max-width:360px;background:#fff;border:1px solid #e4e6eb;border-radius:16px;
    padding:32px 28px;text-align:center;box-shadow:0 10px 34px rgba(0,0,0,.08);
    animation:rise .25s ease-out}
  @keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .icon{width:56px;height:56px;border-radius:50%;margin:0 auto 18px;
    display:flex;align-items:center;justify-content:center}
  .icon svg{width:30px;height:30px}
  .ok .icon{background:#e7f7ee;color:#1a7f47}
  .err .icon{background:#fdeaea;color:#c0392b}
  h1{font-size:18px;font-weight:600;margin:0 0 8px}
  .detail{font-size:14px;color:#4b4f56;margin:0;word-break:break-word}
  .hint{font-size:12px;color:#8a8d91;margin:16px 0 0}
  @media (prefers-color-scheme:dark){
    body{background:#0f1013;color:#e9eaec}
    .card{background:#1b1d21;border-color:#2a2d33;box-shadow:0 10px 34px rgba(0,0,0,.45)}
    .detail{color:#b7bbc2}.hint{color:#7d8189}
    .ok .icon{background:#13301f;color:#4ade80}
    .err .icon{background:#3a1b1b;color:#f87171}
  }
</style>
</head>
<body>
<main class="card ${params.ok ? "ok" : "err"}">
  <div class="icon">${params.ok ? okIcon : errIcon}</div>
  <h1>${heading}</h1>
  <p class="detail">${detail}</p>
  <p class="hint">${hint}</p>
</main>
<script id="cfg" type="application/json">${cfg}</script>
<script>${OAUTH_CALLBACK_SCRIPT}</script>
</body>
</html>`;
}
