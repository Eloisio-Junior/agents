import type { PrismaClient } from "@/../generated/prisma/client";
import logger from "@/api/lib/logger";
import basePrisma from "@/api/lib/prisma";
import config from "@/config";
import {
  type ClaimedJob,
  claimDueJobs,
  completeJob,
  failJob,
  reapStaleJobs,
  rescheduleJob,
} from "./service";

// Single-replica worker that drains the scheduler. The handler registry decouples the scheduler
// from feature logic (follow-ups register their handlers); a job kind with no handler fails (and
// eventually goes DEAD) rather than silently vanishing. `reschedule` is for "not yet" (out of
// hours) and does not consume an attempt; `fail` retries with backoff up to the cap.

export type JobResult =
  | { outcome: "done" }
  // `payload`, when present, REPLACES the job's payload on reschedule (e.g. a follow-up advancing its
  // step index on the same row). Omit it to keep the current payload.
  | { outcome: "reschedule"; runAt: Date; payload?: Record<string, unknown> }
  | { outcome: "fail"; error?: string };

export type JobHandler = (
  job: ClaimedJob,
  base: PrismaClient,
) => Promise<JobResult>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}
export function getJobHandler(kind: string): JobHandler | undefined {
  return handlers.get(kind);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Runs one claimed job through its handler and records the outcome (under the job's tenant scope).
export async function runClaimed(
  job: ClaimedJob,
  base: PrismaClient = basePrisma,
): Promise<void> {
  const handler = getJobHandler(job.kind);
  if (!handler) {
    await failJob(
      job.tenantId,
      job.id,
      job.attempts,
      `no handler: ${job.kind}`,
      base,
    );
    return;
  }
  let result: JobResult;
  try {
    result = await handler(job, base);
  } catch (err) {
    await failJob(job.tenantId, job.id, job.attempts, errMsg(err), base);
    return;
  }
  if (result.outcome === "done") {
    await completeJob(job.tenantId, job.id, base);
  } else if (result.outcome === "reschedule") {
    await rescheduleJob(
      job.tenantId,
      job.id,
      result.runAt,
      result.payload,
      base,
    );
  } else {
    await failJob(
      job.tenantId,
      job.id,
      job.attempts,
      result.error ?? "failed",
      base,
    );
  }
}

export interface TickOptions {
  staleMs: number;
  batchSize: number;
}

export async function runSchedulerTick(
  base: PrismaClient,
  opts: TickOptions,
): Promise<{ claimed: number; reaped: number }> {
  const reaped = await reapStaleJobs(opts.staleMs, base);
  const jobs = await claimDueJobs(opts.batchSize, base);
  for (const job of jobs) {
    await runClaimed(job, base);
  }
  return { claimed: jobs.length, reaped };
}

interface Holder {
  timer?: ReturnType<typeof setInterval>;
  running: boolean;
}

const KEY = Symbol.for("secv4.scheduler.worker");

function holder(): Holder {
  const g = globalThis as unknown as Record<symbol, Holder>;
  g[KEY] ??= { running: false };
  return g[KEY];
}

export interface StartOptions {
  base?: PrismaClient;
  intervalMs?: number;
  staleMs?: number;
  batchSize?: number;
}

// Idempotent singleton (survives `bun --hot` reloads via globalThis, so no ghost timers). The tick
// is non-overlapping (a `running` guard). Returns the stop function.
export function startScheduler(opts: StartOptions = {}): () => void {
  const h = holder();
  if (h.timer) return stopScheduler;
  const base = opts.base ?? basePrisma;
  const intervalMs = opts.intervalMs ?? config.schedulerWorker.intervalMs;
  const staleMs = opts.staleMs ?? 5 * 60_000;
  const batchSize = opts.batchSize ?? 20;
  h.timer = setInterval(() => {
    if (h.running) return;
    h.running = true;
    void runSchedulerTick(base, { staleMs, batchSize })
      .catch((err) => logger.error({ err }, "scheduler tick failed"))
      .finally(() => {
        h.running = false;
      });
  }, intervalMs);
  logger.info("scheduler worker started (interval=%dms)", intervalMs);
  return stopScheduler;
}

export function stopScheduler(): void {
  const h = holder();
  if (h.timer) {
    clearInterval(h.timer);
    h.timer = undefined;
  }
}
