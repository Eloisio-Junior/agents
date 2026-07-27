/// <reference lib="dom" />

import { describe, expect, spyOn, test } from "bun:test";
import {
  acquireBeforeUnload,
  pushBackBlocker,
} from "@/client/lib/unsavedGuard";

// The guard manager is a module-level singleton (the listeners must survive
// component unmounts), so each test fully releases what it acquires to keep the
// shared state balanced for the next one.

describe("unsavedGuard: beforeunload", () => {
  test("ref-counts the beforeunload listener (attach once, detach on last release)", () => {
    const add = spyOn(window, "addEventListener");
    const remove = spyOn(window, "removeEventListener");
    const adds = () =>
      add.mock.calls.filter((c) => c[0] === "beforeunload").length;
    const removes = () =>
      remove.mock.calls.filter((c) => c[0] === "beforeunload").length;

    const r1 = acquireBeforeUnload();
    const r2 = acquireBeforeUnload();
    expect(adds()).toBe(1); // only the first acquire attaches
    r1();
    expect(removes()).toBe(0); // still one holder
    r2();
    expect(removes()).toBe(1); // last release detaches

    add.mockRestore();
    remove.mockRestore();
  });

  test("the attached listener prevents the unload, and stops after release", () => {
    const release = acquireBeforeUnload();
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);

    release();
    const e2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});

describe("unsavedGuard: back-button trap", () => {
  test("arms a sentinel, re-arms on Back, and notifies the top blocker", () => {
    const push = spyOn(window.history, "pushState");
    const back = spyOn(window.history, "back").mockImplementation(() => {});
    let calls = 0;
    const unregister = pushBackBlocker(() => {
      calls += 1;
    });

    expect(push.mock.calls.length).toBe(1); // armed on first blocker
    window.dispatchEvent(new Event("popstate")); // simulate Back
    expect(calls).toBe(1); // top blocker notified
    expect(push.mock.calls.length).toBe(2); // re-armed to keep protecting

    unregister();
    push.mockRestore();
    back.mockRestore();
  });

  test("only one sentinel for the whole stack; LIFO notification order", () => {
    const push = spyOn(window.history, "pushState");
    const back = spyOn(window.history, "back").mockImplementation(() => {});
    let a = 0;
    let b = 0;
    const ra = pushBackBlocker(() => {
      a += 1;
    });
    const rb = pushBackBlocker(() => {
      b += 1;
    });
    // A single sentinel is pushed when the stack goes empty→non-empty.
    expect(push.mock.calls.length).toBe(1);

    window.dispatchEvent(new Event("popstate"));
    expect(b).toBe(1); // topmost first
    expect(a).toBe(0);

    rb();
    window.dispatchEvent(new Event("popstate"));
    expect(a).toBe(1); // next one down after the top is removed

    ra();
    push.mockRestore();
    back.mockRestore();
  });
});
