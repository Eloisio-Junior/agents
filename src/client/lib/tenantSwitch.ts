// Switching the active tenant does a full reload (the single TOCTOU-safe source of truth). On a
// detail route whose id belongs to the OLD tenant (e.g. /agents/<id>), that id won't exist in the new
// tenant, so reloading in place lands on an error page. tenantSwitchTarget maps such a route to its
// list root; non-detail routes return null (reload in place is correct). Extend DETAIL_ROOTS as new
// id-bearing routes appear ("repetir de acordo com o contexto").
const DETAIL_ROOTS: { pattern: RegExp; root: string }[] = [
  // /agents/:id and /agents/:id/:tab -> /agents
  { pattern: /^\/agents\/[^/]+(?:\/[^/]+)?\/?$/, root: "/agents" },
  // /conversations/:id -> /conversations
  { pattern: /^\/conversations\/[^/]+\/?$/, root: "/conversations" },
];

// Given the current pathname, returns the list root to navigate to after a tenant switch, or null when
// the current route is safe to reload in place (a list, a global/admin page, the dashboard).
export function tenantSwitchTarget(pathname: string): string | null {
  for (const { pattern, root } of DETAIL_ROOTS) {
    if (pattern.test(pathname)) return root;
  }
  return null;
}
