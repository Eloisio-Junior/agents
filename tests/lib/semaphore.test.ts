import { describe, expect, test } from "bun:test";
import { Semaphore } from "@/lib/semaphore";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("Semaphore", () => {
  test("never runs more than `permits` tasks at once", async () => {
    const sem = new Semaphore(3);
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 10 }, () =>
        sem.run(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await tick();
          active -= 1;
        }),
      ),
    );
    expect(maxActive).toBe(3);
    expect(active).toBe(0);
  });

  test("releases the permit when a task throws", async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.run(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    // If the permit leaked, this second run would hang forever (permits=1).
    const ok = await sem.run(() => Promise.resolve("ok"));
    expect(ok).toBe("ok");
  });

  test("runs every task to completion, preserving result order", async () => {
    const sem = new Semaphore(2);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        sem.run(async () => {
          await tick();
          return i;
        }),
      ),
    );
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("clamps non-positive permits to at least 1 (no deadlock)", async () => {
    const sem = new Semaphore(0);
    const ok = await sem.run(() => Promise.resolve("ran"));
    expect(ok).toBe("ran");
  });
});
