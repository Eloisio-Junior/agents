import config from "@/config";
import { Semaphore } from "@/lib/semaphore";

// Process-wide cap on concurrent agent model calls: the LLM round-trip in the LangGraph agent node
// (graph.ts) and the opt-in TTS-normalize call. Conversations drain fully in parallel; this bounds
// how many model calls are in flight at once across ALL entrypoints (debounce/webhook/nudge/
// playground) so a burst does not hammer the provider. Singleton on globalThis so `bun --hot`
// reloads reuse one instance (same pattern as worker.ts / checkpointer.ts).

const KEY = Symbol.for("secv4.model.semaphore");

function sem(): Semaphore {
  const g = globalThis as unknown as Record<symbol, Semaphore>;
  g[KEY] ??= new Semaphore(config.agent.modelConcurrency);
  return g[KEY];
}

export function runModelCall<T>(fn: () => Promise<T>): Promise<T> {
  return sem().run(fn);
}
