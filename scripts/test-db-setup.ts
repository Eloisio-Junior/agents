#!/usr/bin/env bun
import { Client } from "pg";

// Provisions (idempotently) the DEDICATED test database the integration suite runs against, so
// tests never touch the dev DB. The suite does destructive, unscoped ops (e.g. `DELETE FROM
// scheduler_jobs`) and creates/drops tenants; pointing it at the dev DB wipes live dev data on
// every `bun test`. Run once after cloning / after a schema change: `bun db:test:setup`.
//
// Reads TEST_APP_DATABASE_URL (app role) and TEST_MIGRATION_DATABASE_URL (superuser) from the env.
// Steps: CREATE DATABASE (if missing) → db-bootstrap (extension, role grants, langgraph schema) →
// prisma migrate deploy. Safe to re-run.

function substitutePort(url: string): string {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: matching the literal ${POSTGRES_PORT} placeholder from .env, not a JS template.
  return url.replace("${POSTGRES_PORT}", process.env.POSTGRES_PORT ?? "5432");
}

function dbNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

// Swap the database in a connection URL for the `postgres` maintenance DB so we can issue
// CREATE DATABASE (which cannot run while connected to the target).
function maintenanceUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}

async function main() {
  const appUrlRaw = process.env.TEST_APP_DATABASE_URL;
  const suUrlRaw = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!appUrlRaw || !suUrlRaw) {
    throw new Error(
      "TEST_APP_DATABASE_URL and TEST_MIGRATION_DATABASE_URL must be set (see .env.example)",
    );
  }
  const appUrl = substitutePort(appUrlRaw);
  const suUrl = substitutePort(suUrlRaw);

  const dbName = dbNameOf(suUrl);
  // Guard: this script (and the suite) must only ever run against a *_test database.
  if (!dbName.endsWith("_test") || dbName !== dbNameOf(appUrl)) {
    throw new Error(
      `refusing to provision: test DB name must end in "_test" and match across both URLs (su="${dbName}", app="${dbNameOf(appUrl)}")`,
    );
  }

  // 1. CREATE DATABASE if missing (via the postgres maintenance DB).
  const maint = new Client({ connectionString: maintenanceUrl(suUrl) });
  await maint.connect();
  try {
    const { rowCount } = await maint.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (rowCount === 0) {
      // dbName is validated (*_test) and comes from our own env, not external input.
      await maint.query(`CREATE DATABASE "${dbName}"`);
      console.log(`test-db-setup: created database "${dbName}"`);
    } else {
      console.log(`test-db-setup: database "${dbName}" already exists`);
    }
  } finally {
    await maint.end();
  }

  // 2. Bootstrap (extension, app-role grants, langgraph schema) and 3. migrate, both pointed at the
  // test DB. db-bootstrap derives the app role from DATABASE_URL and connects via
  // MIGRATION_DATABASE_URL; prisma migrate (prisma.config.ts) connects via MIGRATION_DATABASE_URL.
  const childEnv = {
    ...process.env,
    DATABASE_URL: appUrl,
    MIGRATION_DATABASE_URL: suUrl,
  };
  for (const cmd of [
    ["bun", "scripts/db-bootstrap.ts"],
    ["bunx", "prisma", "migrate", "deploy"],
  ]) {
    const proc = Bun.spawn(cmd, {
      env: childEnv,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`"${cmd.join(" ")}" exited with code ${code}`);
    }
  }
  console.log(`test-db-setup: "${dbName}" ready`);
}

main().catch((err) => {
  console.error(
    "test-db-setup failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
