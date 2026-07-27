import { t } from "elysia";

// Shared OpenAPI documentation helpers (DEV-only docs at /api/docs). They keep per-route annotations
// DRY and consistent across controllers: a standard error-response schema, an `errors(...)` builder
// for the `response` status map, and a `doc(...)` builder for `detail` (summary + description).
//
// SAFETY: declaring only ERROR statuses in `response` does NOT validate the 2xx success path (Elysia
// validates per declared status; an undeclared 200 passes through and is inferred for the spec). The
// app's error handler returns a raw `Response.json({ error })` (see src/app.ts onError), which Elysia
// does not run through response validation either — so these annotations are documentation-only and
// carry no runtime-validation risk.

// The canonical error body every endpoint returns on failure: `{ error: "<message>" }`.
export const ErrorResponse = t.Object(
  { error: t.String({ description: "Human-readable error message." }) },
  { description: "Error response." },
);

// OAuth 2.1 error body (RFC 6749 §5.2): `error` code + optional `error_description`.
export const OAuthErrorResponse = t.Object(
  {
    error: t.String({ description: "OAuth error code (e.g. invalid_grant)." }),
    error_description: t.Optional(t.String()),
  },
  { description: "OAuth 2.1 error response." },
);

const STATUS_DESCRIPTION: Record<number, string> = {
  400: "Bad request — validation failed or the input was malformed.",
  401: "Unauthorized — missing or invalid credentials.",
  403: "Forbidden — authenticated but not allowed (role or tenant gate).",
  404: "Not found.",
  409: "Conflict — a duplicate or a state conflict.",
  410: "Gone — the resource has expired.",
  413: "Payload too large.",
  415: "Unsupported media type.",
  422: "Unprocessable — the input is syntactically valid but semantically rejected.",
  429: "Too many requests — rate limited.",
  502: "Bad gateway — an upstream dependency failed.",
};

// Build the `response` status map for the error codes a route can actually return. Each status reuses
// the standard error body with a status-appropriate description.
//
// CRITICAL: the `const` type parameter makes the return type a map of LITERAL numeric keys
// (`{ 400: …; 404: … }`), NOT `Record<number, …>`. A `Record<number>` index signature would tell
// the Eden treaty client that EVERY status (including 200) is the error body, collapsing the success
// `data` type to `{ error: string }` across the whole client. With literal keys, only the declared
// error statuses are constrained and the 2xx success type is still inferred from the handler return.
export function errors<const S extends readonly number[]>(
  ...statuses: S
): { [K in S[number]]: typeof ErrorResponse } {
  const out = {} as { [K in S[number]]: typeof ErrorResponse };
  for (const code of statuses) {
    (out as Record<number, typeof ErrorResponse>)[code] = t.Object(
      { error: t.String() },
      { description: STATUS_DESCRIPTION[code] ?? "Error." },
    );
  }
  return out;
}

// Build a `detail` fragment (summary + optional description) for a route. Tags stay at the instance
// level; the rare per-route tag is set inline (the mixed v1 controller).
export function doc(
  summary: string,
  description?: string,
): { summary: string; description?: string } {
  return description ? { summary, description } : { summary };
}
