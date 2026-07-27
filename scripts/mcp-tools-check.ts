// Headless validation of MCP tools/list by role — builds the per-request server for a read-only,
// a write, and an admin principal over an in-memory transport and asserts scope-gating + that no
// tool name leaks a secret. Listing tools never invokes a handler, so this needs no DB/network.
// Run: bun scripts/mcp-tools-check.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { VerifiedToken } from "@/modules/mcp/oauth/tokens";
import { buildMcpServer } from "@/modules/mcp/server";

async function toolsFor(principal: VerifiedToken): Promise<string[]> {
  const server = buildMcpServer(principal);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "check", version: "0" });
  await client.connect(clientT);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => t.name).sort();
}

const base: VerifiedToken = {
  userId: 1n,
  tenantId: 1n,
  role: "TENANT_ADMIN",
  scopes: [],
  clientId: "c",
  jti: "j",
};

const readOnly = await toolsFor({
  ...base,
  role: "AGENT",
  scopes: ["mcp:read"],
});
const write = await toolsFor({ ...base, scopes: ["mcp:read", "mcp:write"] });
const admin = await toolsFor({
  ...base,
  tenantId: null,
  role: "SUPER_ADMIN",
  scopes: ["mcp:read", "mcp:write", "mcp:admin"],
});

const fail: string[] = [];
const has = (set: string[], name: string) => set.includes(name);

// Scope-gating invariants.
if (!has(readOnly, "whoami")) fail.push("read-only missing whoami");
if (!has(readOnly, "agent_get")) fail.push("read-only missing agent_get");
if (readOnly.some((n) => n.endsWith("_create") || n.endsWith("_update")))
  fail.push("read-only token exposes a write tool");
if (!has(write, "agent_create")) fail.push("write missing agent_create");
if (has(write, "tenant_create")) fail.push("write token exposes tenant_create");
if (!has(admin, "tenant_create")) fail.push("admin missing tenant_create");
if (!has(admin, "branding_set")) fail.push("admin missing branding_set");
// No tool name should look like it returns a raw secret.
const suspicious = admin.filter((n) => /secret|token|password|apikey/i.test(n));
if (suspicious.length)
  fail.push(`suspicious tool names: ${suspicious.join(", ")}`);

console.log(
  JSON.stringify(
    {
      counts: {
        readOnly: readOnly.length,
        write: write.length,
        admin: admin.length,
      },
      readOnly,
      writeOnlyAdds: write.filter((n) => !readOnly.includes(n)),
      adminOnlyAdds: admin.filter((n) => !write.includes(n)),
      ok: fail.length === 0,
      failures: fail,
    },
    null,
    2,
  ),
);
if (fail.length) process.exit(1);
