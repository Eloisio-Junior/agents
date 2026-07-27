import Elysia from "elysia";
import { doc } from "@/api/lib/openapi";
import prisma from "@/api/lib/prisma";
import config from "@/config";

type DbHealth = { ok: true } | { ok: false; error: string };

async function checkDb(): Promise<DbHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export const healthController = new Elysia({
  prefix: "/health",
  tags: ["System"],
}).get(
  "/",
  async () => {
    const base = {
      name: config.packageInfo.name,
      version: config.packageInfo.version,
    };

    const db = await checkDb();
    return {
      ...base,
      status: db.ok ? "ok" : "degraded",
      db,
    };
  },
  {
    detail: {
      ...doc(
        "Liveness & DB health",
        'Public health probe. Returns the app name/version plus a database connectivity check (status "degraded" if the DB is unreachable). No authentication.',
      ),
      security: [],
    },
  },
);
