import { describe, expect, test } from "bun:test";
import { setupPrismaMock } from "@/tests/utils/prisma-mock";

// DCR is closed by default (MCP_DCR_ENABLED unset in tests). The register endpoint must return 404
// (no signal the route exists) before any DB access — verifiable with the prisma mock.
setupPrismaMock();
const app = (await import("@/app")).default;

describe("MCP DCR endpoint (disabled by default)", () => {
  test("POST /api/v1/mcp/oauth/register → 404 when MCP_DCR_ENABLED is off", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/mcp/oauth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["https://app.example.com/cb"] }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("not_found");
  });
});
