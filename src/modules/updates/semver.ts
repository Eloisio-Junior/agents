// Minimal semver comparison for our own release tags (e.g. "1.2.0"). Pre-release/build suffixes are
// compared by their numeric base only (we never advertise pre-releases as updates). Unparseable input
// compares as equal so it can never falsely trigger an "update available".
function parse(v: string): [number, number, number] | null {
  const base = v.trim().replace(/^v/i, "").split(/[-+]/, 1)[0] ?? "";
  if (!base) return null;
  const parts = base.split(".").slice(0, 3);
  const nums: number[] = [];
  for (const p of parts) {
    // Reject empty/non-numeric segments: Number("") is 0, which would wrongly parse "" as 0.0.0.
    if (!/^\d+$/.test(p)) return null;
    nums.push(Number(p));
  }
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
}

// -1 if a < b, 1 if a > b, 0 if equal or either side is unparseable.
export function compareSemver(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// True when `latest` is a strictly newer, parseable release than `current`, and `current` is a real
// release (not the "0.0.0" placeholder used in dev/master, where no image tag is baked in).
export function isUpdateAvailable(
  current: string,
  latest: string | null,
): boolean {
  if (!latest || !current || current === "0.0.0") return false;
  if (!parse(current) || !parse(latest)) return false;
  return compareSemver(latest, current) > 0;
}
