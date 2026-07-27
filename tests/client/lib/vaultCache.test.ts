import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setActiveTenantId } from "@/client/lib/activeTenant";
import {
  invalidateVault,
  loadVault,
  refreshVault,
  VAULT_CHANGED_EVENT,
} from "@/client/lib/vaultCache";

// Stub the global fetch (the Eden treaty calls it) instead of mocking the api module — a mock.module
// would leak to every other test file in the shared process. We count GET /vault hits and control the
// active tenant with the real setActiveTenantId (localStorage, provided by happy-dom).
const realFetch = globalThis.fetch;
let getCalls = 0;
let entriesToReturn: Array<{ id: string; name: string; kind: string | null }> =
  [];

beforeEach(() => {
  invalidateVault();
  setActiveTenantId(null);
  getCalls = 0;
  entriesToReturn = [{ id: "1", name: "openai", kind: "openai" }];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/v1/vault")) {
      getCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ entries: entriesToReturn }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo | URL);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("vaultCache", () => {
  test("dedups concurrent loads into a single fetch", async () => {
    const [a, b, c] = await Promise.all([
      loadVault(),
      loadVault(),
      loadVault(),
    ]);
    expect(getCalls).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a).toHaveLength(1);
  });

  test("serves from cache within the TTL", async () => {
    await loadVault();
    await loadVault();
    expect(getCalls).toBe(1);
  });

  test("refreshVault forces a refetch and emits the change event", async () => {
    await loadVault();
    let fired = 0;
    const h = () => {
      fired++;
    };
    window.addEventListener(VAULT_CHANGED_EVENT, h);
    await refreshVault();
    window.removeEventListener(VAULT_CHANGED_EVENT, h);
    expect(getCalls).toBe(2);
    expect(fired).toBe(1);
  });

  test("invalidateVault drops the cache (next load refetches) and emits", async () => {
    await loadVault();
    let fired = 0;
    const h = () => {
      fired++;
    };
    window.addEventListener(VAULT_CHANGED_EVENT, h);
    invalidateVault();
    expect(fired).toBe(1);
    await loadVault();
    window.removeEventListener(VAULT_CHANGED_EVENT, h);
    expect(getCalls).toBe(2);
  });

  test("keys by active tenant so it never serves another tenant's vault", async () => {
    setActiveTenantId("10");
    await loadVault();
    setActiveTenantId("20");
    await loadVault();
    expect(getCalls).toBe(2);
    // Back to tenant 10 → still cached (no extra fetch).
    setActiveTenantId("10");
    await loadVault();
    expect(getCalls).toBe(2);
  });
});
