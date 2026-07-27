import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import config from "@/config";
import { AppError } from "@/lib/errors";

// Anti-SSRF guard for every configurable outbound URL (webhooks, custom HTTP tools, MCP
// connections, integration callbacks). Blocks private / loopback / link-local / CGNAT /
// metadata ranges (IPv4, IPv6, and IPv4-mapped IPv6), enforces https, and resolves
// hostnames to check the actual target. See docs/api-and-fleet.md.
//
// NOTE: this resolves-and-checks immediately before use, which closes most of the gap but
// not a determined DNS-rebinding TOCTOU (a hostname's record can flip to a private/metadata
// IP between this lookup and the socket connect, since fetch re-resolves independently —
// Bun fetch exposes no per-request DNS/connect hook to pin the validated IP). Full mitigation
// pins the connection to the resolved IP via a custom dispatcher; TRACKED for the fetch
// wrapper (known HIGH limitation, surfaced by the review). Until then, callers should
// lock origins to an allowlist where the set of legitimate hosts is known. The outbound
// webhook URL is set by a TENANT_ADMIN, so the residual threat is a privileged operator, not
// an anonymous attacker.

export class SsrfError extends AppError {
  constructor(message: string) {
    super(`Blocked outbound URL: ${message}`, 400);
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

function inV4Range(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (b & mask);
}

// 0/8 "this host", 10/8, 100.64/10 CGNAT, 127/8 loopback, 169.254/16 link-local
// (includes the 169.254.169.254 metadata address), 172.16/12, 192.0.0/24, 192.168/16,
// 198.18/15 benchmarking, 224/4 multicast, 240/4 reserved.
const V4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → fail-closed
  return V4_BLOCKS.some(([base, bits]) => inV4Range(n, base, bits));
}

// Expand an IPv6 literal to its 8 16-bit groups, normalizing `::` compression and any
// embedded dotted-decimal IPv4 tail. Returns null on anything malformed (caller fails closed).
// We parse to groups ourselves because `new URL()` rewrites embedded IPv4 into HEX hextets
// (https://[::ffff:169.254.169.254] → [::ffff:a9fe:a9fe]); a text regex over the original
// string misses that form and was a real SSRF bypass to metadata/loopback/RFC1918.
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  // Fold a trailing dotted IPv4 (`...:a.b.c.d`) into two hextets before group parsing.
  const dotted = s.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[2] as string);
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    s = `${dotted[1]}${hi}:${lo}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (seg: string): number[] | null => {
    if (seg === "") return [];
    const out: number[] = [];
    for (const h of seg.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      out.push(Number.parseInt(h, 16));
    }
    return out;
  };
  const head = toGroups(halves[0] as string);
  if (head === null) return null;
  let groups: number[];
  if (halves.length === 2) {
    const tail = toGroups(halves[1] as string);
    if (tail === null) return null;
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  return groups.length === 8 ? groups : null;
}

// Two consecutive 16-bit groups → dotted IPv4 (for embedded-IPv4 forms).
function embeddedV4(groups: number[], start: number): string {
  const hi = groups[start] as number;
  const lo = groups[start + 1] as number;
  return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
}

export function isBlockedIpv6(ip: string): boolean {
  const groups = ipv6Groups(ip);
  if (groups === null) return true; // unparseable → fail-closed
  const [g0, g1, g2, g3, g4, g5] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const head5Zero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // Any IPv4 embedded in IPv6 is judged by the v4 rules (this is what closes the
  // ::ffff:a9fe:a9fe / 6to4 / NAT64 SSRF bypasses, regardless of hex vs dotted spelling).
  if (head5Zero && g5 === 0xffff) return isBlockedIpv4(embeddedV4(groups, 6)); // ::ffff:0:0/96 mapped
  if (head5Zero && g5 === 0) return isBlockedIpv4(embeddedV4(groups, 6)); // ::/96 compatible (covers ::, ::1)
  if (g0 === 0x2002) return isBlockedIpv4(embeddedV4(groups, 1)); // 2002::/16 6to4
  if (
    g0 === 0x0064 &&
    g1 === 0xff9b &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0
  )
    return isBlockedIpv4(embeddedV4(groups, 6)); // 64:ff9b::/96 NAT64

  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true; // not an IP literal → fail-closed
}

export interface SafeUrlOptions {
  // NOTE: default https-only. Dev/self-hosted integrations may opt into http.
  allowHttp?: boolean;
  // NOTE: When true, skips the private/loopback/metadata IP range check AND allows http: so
  // operators can target local services during development. Effective value: opts.allowPrivate ??
  // config.ssrf.allowPrivateTargets (auto-true in development, false in production unless
  // SSRF_ALLOW_PRIVATE_TARGETS=true is set explicitly). Protocol and URL-parseability checks
  // always run regardless — file:, ftp:, etc. are never allowed.
  allowPrivate?: boolean;
}

export async function assertSafeOutboundUrl(
  rawUrl: string,
  opts: SafeUrlOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("invalid URL");
  }

  const privateAllowed = opts.allowPrivate ?? config.ssrf.allowPrivateTargets;
  const httpAllowed = opts.allowHttp || privateAllowed;

  if (url.protocol !== "https:" && !(httpAllowed && url.protocol === "http:")) {
    throw new SsrfError(`protocol ${url.protocol} not allowed`);
  }

  if (privateAllowed) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(host)) {
    if (isBlockedIp(host))
      throw new SsrfError(`address ${host} is in a blocked range`);
    return url;
  }

  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0) throw new SsrfError(`${host} did not resolve`);
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new SsrfError(`${host} resolves to blocked address ${address}`);
    }
  }
  return url;
}
