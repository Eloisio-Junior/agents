import { describe, expect, test } from "bun:test";
import {
  chatwootThreadId,
  contactInboxThreadId,
  resolveGraphThreadId,
  threadBelongsToTenant,
} from "@/graph/checkpointer";

describe("graph thread keys", () => {
  test("contactInboxThreadId namespaces by tenant:instance:ci", () => {
    expect(contactInboxThreadId(3n, 5n, 7700)).toBe("3:5:ci:7700");
  });

  test("chatwootThreadId is the per-conversation key", () => {
    expect(chatwootThreadId(3n, 5n, 42)).toBe("3:5:42");
  });

  test("resolveGraphThreadId prefers the contact-inbox key when present", () => {
    expect(resolveGraphThreadId(3n, 5n, 42, 7700)).toBe("3:5:ci:7700");
  });

  test("resolveGraphThreadId degrades to the per-conversation key when contactInboxId is null", () => {
    // Not a second key scheme — just null handling on a nullable column. No contact+inbox composite.
    expect(resolveGraphThreadId(3n, 5n, 42, null)).toBe("3:5:42");
  });

  test("both thread keys carry the tenant fence (threadBelongsToTenant)", () => {
    expect(threadBelongsToTenant(contactInboxThreadId(3n, 5n, 7700), 3n)).toBe(
      true,
    );
    expect(threadBelongsToTenant(contactInboxThreadId(3n, 5n, 7700), 4n)).toBe(
      false,
    );
    expect(threadBelongsToTenant(chatwootThreadId(3n, 5n, 42), 3n)).toBe(true);
  });
});
