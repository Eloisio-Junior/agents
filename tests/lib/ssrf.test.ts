import { describe, expect, test } from "bun:test";
import { assertSafeOutboundUrl, isBlockedIp, isBlockedIpv6 } from "@/lib/ssrf";

describe("isBlockedIp", () => {
  test("blocks private / loopback / link-local / CGNAT / metadata IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("allows public IPv4", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("1.1.1.1")).toBe(false);
  });

  test("blocks IPv6 loopback / ULA / link-local and IPv4-mapped metadata", () => {
    expect(isBlockedIpv6("::1")).toBe(true);
    expect(isBlockedIpv6("::")).toBe(true);
    expect(isBlockedIpv6("fc00::1")).toBe(true);
    expect(isBlockedIpv6("fd12:3456::1")).toBe(true);
    expect(isBlockedIpv6("fe80::1")).toBe(true);
    expect(isBlockedIpv6("feb0::1")).toBe(true);
    expect(isBlockedIpv6("ff02::1")).toBe(true);
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
  });

  // Regression: the IPv4-mapped/embedded forms in HEX hextets (what `new URL()` normalizes a
  // dotted literal into) must block too — these were a real SSRF bypass to metadata/loopback.
  test("blocks IPv4-mapped/6to4/NAT64 IPv6 written in hex hextets", () => {
    expect(isBlockedIpv6("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254 (metadata)
    expect(isBlockedIpv6("::ffff:7f00:1")).toBe(true); // 127.0.0.1
    expect(isBlockedIpv6("::ffff:a00:1")).toBe(true); // 10.0.0.1
    expect(isBlockedIpv6("2002:a9fe:a9fe::")).toBe(true); // 6to4 → 169.254.169.254
    expect(isBlockedIpv6("64:ff9b::a00:1")).toBe(true); // NAT64 → 10.0.0.1
    expect(isBlockedIpv6("::7f00:1")).toBe(true); // IPv4-compatible → 127.0.0.1
  });

  test("allows legitimate public IPv6", () => {
    expect(isBlockedIpv6("2606:4700:4700::1111")).toBe(false); // Cloudflare DNS
    expect(isBlockedIpv6("2001:4860:4860::8888")).toBe(false); // Google DNS
    expect(isBlockedIpv6("::ffff:8.8.8.8")).toBe(false); // mapped public IPv4
  });

  test("fails closed on non-IP input", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIpv6("::ffff:zzzz:1")).toBe(true);
    expect(isBlockedIpv6("1:2:3:4:5:6:7:8:9")).toBe(true);
  });
});

describe("assertSafeOutboundUrl", () => {
  test("rejects non-https by default", async () => {
    await expect(assertSafeOutboundUrl("http://example.com")).rejects.toThrow();
  });

  test("allows http only when opted in", async () => {
    // 1.1.1.1 is a public literal → no DNS lookup needed.
    await expect(
      assertSafeOutboundUrl("http://1.1.1.1", { allowHttp: true }),
    ).resolves.toBeInstanceOf(URL);
  });

  test("rejects a blocked IP literal", async () => {
    await expect(
      assertSafeOutboundUrl("https://169.254.169.254"),
    ).rejects.toThrow();
  });

  test("accepts a public IP literal over https", async () => {
    await expect(
      assertSafeOutboundUrl("https://8.8.8.8"),
    ).resolves.toBeInstanceOf(URL);
  });

  test("rejects an IPv4-mapped IPv6 metadata literal (new URL normalizes to hex)", async () => {
    // new URL("https://[::ffff:169.254.169.254]/") → hostname "[::ffff:a9fe:a9fe]".
    await expect(
      assertSafeOutboundUrl(
        "https://[::ffff:169.254.169.254]/latest/meta-data/",
      ),
    ).rejects.toThrow();
    await expect(
      assertSafeOutboundUrl("https://[::ffff:a9fe:a9fe]/"),
    ).rejects.toThrow();
    await expect(
      assertSafeOutboundUrl("https://[::ffff:10.0.0.1]/"),
    ).rejects.toThrow();
  });

  test("rejects a hostname that resolves to a blocked address", async () => {
    // localhost resolves to 127.0.0.1 / ::1 via the hosts file (no network).
    await expect(assertSafeOutboundUrl("https://localhost")).rejects.toThrow();
  });

  test("rejects a malformed URL", async () => {
    await expect(assertSafeOutboundUrl("::::nonsense")).rejects.toThrow();
  });
});

describe("assertSafeOutboundUrl — allowPrivate escape", () => {
  test("allowPrivate:true lets localhost through", async () => {
    await expect(
      assertSafeOutboundUrl("http://localhost/api", { allowPrivate: true }),
    ).resolves.toBeInstanceOf(URL);
  });

  test("allowPrivate:true lets 127.0.0.1 over http through", async () => {
    await expect(
      assertSafeOutboundUrl("http://127.0.0.1/mcp", { allowPrivate: true }),
    ).resolves.toBeInstanceOf(URL);
  });

  test("allowPrivate:true still blocks file: protocol", async () => {
    await expect(
      assertSafeOutboundUrl("file:///etc/passwd", { allowPrivate: true }),
    ).rejects.toThrow(/protocol/);
  });
});
