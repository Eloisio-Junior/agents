// The HTTP header fazer.ai agents uses to authenticate to a Chatwoot instance.
//
// Chatwoot documents this header as `api_access_token` (underscore), but reverse proxies DROP request
// headers whose names contain underscores — a long-standing CGI/RFC-3875 ambiguity defense (both `-`
// and `_` collapse to `_` in the CGI var, so an underscore header could spoof a hyphen one the proxy
// itself sets; nginx ships `underscores_in_headers off`, and the Caddy bundled with Chatwoot drops them
// too). So the underscore spelling 401s through a proxied public URL while working only on a direct or
// internal hop.
//
// Rails (Rack) normalizes `-` and `_` to the same `HTTP_API_ACCESS_TOKEN`, so the HYPHEN spelling is
// read identically by Chatwoot AND survives every proxy. We therefore send the hyphen everywhere we
// authenticate to Chatwoot: the client calls (client.ts) AND the `chatwoot_api_token` vault injection
// (secret-types.ts), which agent HTTP tools and the credential connectivity test go through. Verified
// end-to-end against a live Chatwoot Pro: hyphen returns 200 both through Caddy and direct to puma;
// underscore 401s through Caddy and 200s direct (proving the proxy, not Chatwoot, is what drops it).
export const CHATWOOT_AUTH_HEADER = "api-access-token";
