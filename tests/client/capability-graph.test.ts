import { describe, expect, test } from "bun:test";
import { type MapGroup, toMermaid } from "@/client/pages/agents/CapabilityMap";

// The capability graph draws the REAL LangGraph topology (vertical): the START → agent ⇄ tools
// (ToolNode) → END spine. To stay readable with many tools, the ToolNode links to each GROUP once
// (not to every tool) and tools stack vertically inside their subgraph, so the graph's width tracks
// the number of groups, not the number of tools. Large groups collapse to a "+N…" overflow node.
describe("toMermaid — agent graph (LangGraph)", () => {
  const groups: MapGroup[] = [
    { key: "native", label: "Built-in", items: ["Transfer", "Tag"] },
    { key: "http", label: "Custom HTTP", items: ["Look up order"] },
  ];

  test("emits a vertical (TB) flowchart with the LangGraph spine", () => {
    const m = toMermaid(groups);
    expect(m.startsWith("flowchart TB")).toBe(true);
    // The real spine: START → agent, the agent ⇄ tools loop, agent → END.
    expect(m).toContain("nStart([START])");
    expect(m).toContain("nEnd([END])");
    expect(m).toContain("nStart --> agent");
    expect(m).toContain("agent -->|tool call| nTools");
    expect(m).toContain("nTools -->|result| agent");
    expect(m).toContain("agent -->|done| nEnd");
  });

  test("links the ToolNode to each GROUP once, keeping every tool as a node", () => {
    const m = toMermaid(groups);
    const edges = m.split("\n").filter((l) => l.includes("nTools --> n"));
    // One edge per group (2 groups), regardless of how many tools each holds.
    expect(edges).toHaveLength(2);
    // Every capability is still drawn as a node.
    expect(m).toContain('"Transfer"');
    expect(m).toContain('"Tag"');
    expect(m).toContain('"Look up order"');
    // Tools within a group stack via invisible links (Built-in has 2 → at least one ~~~).
    expect(m).toContain("~~~");
  });

  test("with no capabilities, only the spine is drawn", () => {
    const m = toMermaid([]);
    expect(m.startsWith("flowchart TB")).toBe(true);
    expect(m).not.toContain("nTools --> n");
    expect(m).toContain("agent -->|done| nEnd");
  });

  test("caps a large group with a '+N…' overflow node", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Tool ${i + 1}`);
    const m = toMermaid([{ key: "native", label: "Built-in", items: many }]);
    // 20 items, cap 12 → 8 hidden behind the overflow marker.
    expect(m).toContain('"+8…"');
    expect(m).toContain('"Tool 12"');
    expect(m).not.toContain('"Tool 13"');
  });
});
