#!/usr/bin/env bun
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CONFLICT_PATTERN = /Found same keys with different values: ([\w.:-]+)/g;
const BINARY = "./node_modules/.bin/i18next";

// The locale catalogs the parser maintains, per config. Kept in sync with the `output`/`locales`
// of i18next-parser{,.api}.config.cjs. The staging dance below writes through these.
const EXTRACT_GROUPS = [
  {
    label: "client",
    configPath: "i18next-parser.config.cjs",
    realDir: "src/client/locales",
  },
  {
    label: "api",
    configPath: "i18next-parser.api.config.cjs",
    realDir: "src/api/locales",
  },
] as const;
const EXTRACT_LOCALES = ["en", "pt-BR"] as const;

async function readIfExists(path: string): Promise<string | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : null;
}

export type I18nExtractConfig = { label: string; configPath: string };

export type I18nExtractResult = {
  exitCode: number;
  conflicts: Array<{ label: string; key: string }>;
};

export async function runI18nExtract(
  configs: I18nExtractConfig[],
  opts: { silent?: boolean } = {},
): Promise<I18nExtractResult> {
  const conflicts: I18nExtractResult["conflicts"] = [];
  let subprocessFailed = false;

  for (const { label, configPath } of configs) {
    const proc = Bun.spawn([BINARY, "--config", configPath], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: opts.silent ? "0" : "1" },
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    await proc.exited;

    if (!opts.silent) {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
    }
    if (proc.exitCode !== 0) subprocessFailed = true;

    const seen = new Set<string>();
    for (const match of (stdout + stderr).matchAll(CONFLICT_PATTERN)) {
      const key = match[1];
      if (!key || seen.has(key)) continue;
      seen.add(key);
      conflicts.push({ label, key });
    }
  }

  if (conflicts.length > 0 && !opts.silent) {
    console.error(
      "\n\x1b[31mError:\x1b[0m i18n keys have conflicting default values:",
    );
    for (const { label, key } of conflicts) {
      console.error(`  - [${label}] ${key}`);
    }
    console.error(
      "\nEach key must use the same default value at every call site. Align the defaults, or use distinct keys.",
    );
  }

  return {
    exitCode: conflicts.length > 0 || subprocessFailed ? 1 : 0,
    conflicts,
  };
}

// Runs the parser against a STAGING dir, then copies each catalog back to its real path ONLY when
// the content changed. i18next-parser rewrites every output file on each run (bumping its mtime)
// even when nothing changed; since the dev server (`bun --hot`) imports src/api/locales/*.json, a
// no-op extract during `bun check`/pre-commit would needlessly hot-reload it. Writing the real file
// only on a genuine change keeps the watcher quiet on no-ops AND still reloads when translations
// actually change. The parser merges against the EXISTING catalog (`defaultValue` reads the prior
// value), so the staging dir is seeded with the current real files before the run.
async function runI18nExtractCli(): Promise<{
  exitCode: number;
  changed: number;
}> {
  const staging = await mkdtemp(join(tmpdir(), "i18n-extract-"));
  try {
    for (const g of EXTRACT_GROUPS) {
      await mkdir(join(staging, g.label), { recursive: true });
      for (const loc of EXTRACT_LOCALES) {
        const current = await readIfExists(join(g.realDir, `${loc}.json`));
        if (current !== null) {
          await Bun.write(join(staging, g.label, `${loc}.json`), current);
        }
      }
    }
    process.env.I18N_STAGING_DIR = staging;
    const result = await runI18nExtract(
      EXTRACT_GROUPS.map((g) => ({ label: g.label, configPath: g.configPath })),
    );
    let changed = 0;
    for (const g of EXTRACT_GROUPS) {
      for (const loc of EXTRACT_LOCALES) {
        const staged = await readIfExists(
          join(staging, g.label, `${loc}.json`),
        );
        if (staged === null) continue;
        const realPath = join(g.realDir, `${loc}.json`);
        if (staged !== (await readIfExists(realPath))) {
          await Bun.write(realPath, staged);
          changed++;
        }
      }
    }
    return { exitCode: result.exitCode, changed };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { exitCode, changed } = await runI18nExtractCli();
  console.log(
    changed > 0
      ? `i18n-extract: ${changed} locale file(s) updated`
      : "i18n-extract: no changes (real catalogs untouched)",
  );
  process.exit(exitCode);
}
