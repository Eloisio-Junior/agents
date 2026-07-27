// Counting semaphore: bounds how many async operations run at once. Used to cap concurrent agent
// model calls process-wide (see src/graph/model-limit.ts) without serializing the rest of the
// conversation pipeline. FIFO — a released permit is handed straight to the next waiter.

export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.available = Math.max(1, Math.floor(permits));
  }

  private acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // NOTE: hand the permit straight to the next waiter; do NOT bump `available` (it already holds it).
      next();
    } else {
      this.available += 1;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
