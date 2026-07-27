// Preview-only highlighting of interpolated prompt variables. `interpolatePromptVars(..., { wrap })`
// wraps each resolved variable value in a private-use sentinel pair; the rehype plugin below turns
// those runs into <span class="prompt-var"> nodes so the live preview colors the dynamic text
// (mirroring the editor's {{token}} highlighting). Private-use code points are used as delimiters so
// ordinary prompt text can never collide with them. The sentinels never reach the runtime prompt —
// only the preview passes `wrap`.

const VAR_START = "\uE000";
const VAR_END = "\uE001";

// Wrap a resolved value so the rehype plugin can find it. Empty resolutions are left bare so an unset
// variable leaves no stray (empty) highlight in the preview.
export function wrapPreviewVar(resolved: string): string {
  return resolved ? `${VAR_START}${resolved}${VAR_END}` : resolved;
}

// Minimal hast shape we touch. Kept local so the client doesn't depend on @types/hast.
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const SPLIT = new RegExp(`${VAR_START}([\\s\\S]*?)${VAR_END}`, "g");

// Split a text node's value into plain text nodes and <span class="prompt-var"> element nodes around
// every sentinel-wrapped run.
function splitVarText(value: string): HastNode[] {
  const out: HastNode[] = [];
  let last = 0;
  for (const m of value.matchAll(SPLIT)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", value: value.slice(last, idx) });
    out.push({
      type: "element",
      tagName: "span",
      properties: { className: ["prompt-var"] },
      children: [{ type: "text", value: m[1] ?? "" }],
    });
    last = idx + m[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function walk(node: HastNode): void {
  if (!node.children) return;
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value?.includes(VAR_START)) {
      next.push(...splitVarText(child.value));
    } else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

// react-markdown rehype plugin: rewrites sentinel runs (added by wrapPreviewVar) into styled spans.
export function rehypeHighlightVars() {
  return (tree: HastNode): void => {
    walk(tree);
  };
}
