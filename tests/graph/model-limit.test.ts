import { describe, expect, test } from "bun:test";
import config from "@/config";
import { runModelCall } from "@/graph/model-limit";

// Exercises the real path (global singleton + config), not just the Semaphore class: proves the
// process-wide cap on concurrent model calls is config.agent.modelConcurrency.

describe("runModelCall", () => {
  test("caps concurrency at config.agent.modelConcurrency", async () => {
    const cap = config.agent.modelConcurrency;
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: cap + 5 }, () =>
        runModelCall(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 15));
          active -= 1;
        }),
      ),
    );
    expect(maxActive).toBe(cap);
    expect(active).toBe(0);
  });

  test("returns the wrapped call's value", async () => {
    expect(await runModelCall(() => Promise.resolve(42))).toBe(42);
  });
});
