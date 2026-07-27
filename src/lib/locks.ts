import type { ScopedDb } from "@/lib/tenancy";

// Serialize work on a single logical entity (a conversation thread, a payment id, ...)
// using a Postgres transaction-scoped advisory lock. MUST run inside a runScoped/
// asSuperAdmin transaction (the lock auto-releases on commit/rollback). Concurrent calls
// with the same key on different connections block until the holder's tx ends.
//
// NOTE: hashtext maps the key to int4, so distinct keys can collide on the same lock
// slot. That only over-serializes (a correctness-safe, throughput-only cost); it never
// lets two holders of the same key run concurrently.
export async function withEntityLock<T>(
  db: ScopedDb,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
  return fn();
}
