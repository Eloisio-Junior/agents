import { describe, expect, test } from "bun:test";
import { isMcpTransport } from "@/api/middlewares/rateLimit";
import { validateRedirectUris } from "@/modules/mcp/oauth/dcr";

describe("validateRedirectUris (RFC 7591 strict allowlist)", () => {
  test("accepts exact https URLs", () => {
    expect(validateRedirectUris(["https://app.example.com/cb"])).toBeNull();
  });
  test("accepts http loopback (native/dev clients)", () => {
    expect(
      validateRedirectUris(["http://localhost:1234/cb", "http://127.0.0.1/cb"]),
    ).toBeNull();
  });
  test("rejects http on a non-loopback host", () => {
    expect(validateRedirectUris(["http://evil.example.com/cb"])).toContain(
      "https",
    );
  });
  test("rejects wildcards", () => {
    expect(validateRedirectUris(["https://*.example.com/cb"])).toContain(
      "wildcard",
    );
  });
  test("rejects a fragment", () => {
    expect(validateRedirectUris(["https://app.example.com/cb#x"])).toContain(
      "fragment",
    );
  });
  test("rejects an unparseable value and an empty list", () => {
    expect(validateRedirectUris(["not a url"])).toContain("invalid");
    expect(validateRedirectUris([])).toContain("required");
  });
});

describe("isMcpTransport (rate-limit exemption)", () => {
  const req = (p: string) => new Request(`http://localhost${p}`);
  test("matches the transport endpoint, not the OAuth subpaths", () => {
    expect(isMcpTransport(req("/api/v1/mcp"))).toBe(true);
    expect(isMcpTransport(req("/api/v1/mcp/"))).toBe(true);
    expect(isMcpTransport(req("/api/v1/mcp/oauth/token"))).toBe(false);
    expect(isMcpTransport(req("/api/v1/mcp/oauth/register"))).toBe(false);
    expect(isMcpTransport(req("/api/v1/conversations"))).toBe(false);
  });
});
