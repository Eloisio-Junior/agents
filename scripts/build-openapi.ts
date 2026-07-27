// Generate the published OpenAPI document from the live REST route schemas and keep the committed
// `openapi.json` in sync. It boots the app in-process, fetches the auto-generated document, normalizes
// the host-dependent `servers` entry so the output is deterministic across machines, then either writes
// the file (`--write`, wired as `bun openapi:generate`) or verifies the committed copy matches and fails
// on drift (default, wired into `bun check` + CI). GitHub Pages serves the committed file (see
// `.github/workflows/deploy-swagger.yml`), so this is the single source of truth for the public docs.
//
// NOTE: The `@elysiajs/openapi` plugin is `enabled: env !== "production"` (src/api/index.ts), and
// config reads NODE_ENV at module-eval time. Force development BEFORE anything imports config: this
// assignment must run before the dynamic `@/app` import evaluates, so `@/app`/`@/config` are imported
// dynamically below (a static import would be hoisted above this line and read the ambient NODE_ENV).
process.env.NODE_ENV = "development";
process.env.LOG_LEVEL ??= "warn";

const OUTPUT_PATH = "openapi.json";
const DOCS_JSON_PATH = "/api/docs/json";

// The published spec is host-agnostic: agents is self-hosted, so there is no single canonical origin.
// We expose the API base as an editable OpenAPI server variable — Swagger UI renders `baseUrl` as a
// free-text input so a reader can point "Try it out" at their own instance — defaulting to the local
// dev URL. This replaces the generated `${PUBLIC_URL}/api` entry (machine-specific, so it would also
// break the drift check). The `x-tenant-id` header that injectTenantHeaderParam (src/api/index.ts)
// adds is kept: it is the SUPER_ADMIN tenant selector, useful to a self-hosting operator.
const API_SERVER = {
  url: "{baseUrl}",
  description: "Your self-hosted fazer.ai agents instance",
  variables: {
    baseUrl: {
      default: "http://localhost:3000/api",
      description: "Base URL of your instance, including the /api prefix",
    },
  },
} as const;

type OpenApiDoc = { servers?: unknown } & Record<string, unknown>;

function normalize(doc: OpenApiDoc): OpenApiDoc {
  doc.servers = [API_SERVER];
  return doc;
}

async function generate(): Promise<string> {
  const { default: app } = await import("@/app");
  return new Promise((resolve, reject) => {
    app.listen(0, async (server) => {
      try {
        const res = await fetch(
          `http://localhost:${server.port}${DOCS_JSON_PATH}`,
        );
        if (res.status !== 200) {
          throw new Error(
            `GET ${DOCS_JSON_PATH} returned ${res.status} (expected 200). The openapi plugin is dev-only; is NODE_ENV=production?`,
          );
        }
        const doc = normalize((await res.json()) as OpenApiDoc);
        resolve(`${JSON.stringify(doc, null, 2)}\n`);
      } catch (error) {
        reject(error);
      } finally {
        server.stop(true);
      }
    });
  });
}

async function main() {
  const write = process.argv.includes("--write");
  const generated = await generate();

  const outFile = Bun.file(OUTPUT_PATH);
  const existing = (await outFile.exists()) ? await outFile.text() : "";

  if (generated === existing) {
    if (write) console.error(`${OUTPUT_PATH} is up to date.`);
    return 0;
  }

  await Bun.write(OUTPUT_PATH, generated);
  if (write) {
    console.error(`${OUTPUT_PATH} written.`);
    return 0;
  }

  console.error(
    `Error: ${OUTPUT_PATH} is out of date and has been regenerated. Stage it and commit (or run \`bun openapi:generate\`).`,
  );
  return 1;
}

process.exit(await main());
