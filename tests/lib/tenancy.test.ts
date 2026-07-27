import { describe, expect, test } from "bun:test";
import {
  authorize,
  isAdminRole,
  resolveRequestTenantContext,
  roleAtLeast,
} from "@/lib/tenancy";

const superAdmin = { id: 1n, tenantId: null, role: "SUPER_ADMIN" as const };
const tenantAdmin = { id: 2n, tenantId: 3n, role: "TENANT_ADMIN" as const };
const agent = { id: 4n, tenantId: 3n, role: "AGENT" as const };

describe("role hierarchy", () => {
  test("roleAtLeast respects SUPER_ADMIN > TENANT_ADMIN > AGENT", () => {
    expect(roleAtLeast("SUPER_ADMIN", "TENANT_ADMIN")).toBe(true);
    expect(roleAtLeast("TENANT_ADMIN", "TENANT_ADMIN")).toBe(true);
    expect(roleAtLeast("AGENT", "TENANT_ADMIN")).toBe(false);
    expect(roleAtLeast(undefined, "AGENT")).toBe(false);
  });

  test("isAdminRole is true only for elevated roles", () => {
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
    expect(isAdminRole("TENANT_ADMIN")).toBe(true);
    expect(isAdminRole("AGENT")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});

describe("authorize", () => {
  test("super admin may target any tenant", () => {
    expect(() =>
      authorize({ tenantId: null, userId: 1n, role: "SUPER_ADMIN" }, 99n),
    ).not.toThrow();
  });

  test("tenant user may only touch its own tenant", () => {
    expect(() =>
      authorize({ tenantId: 3n, userId: 2n, role: "TENANT_ADMIN" }, 3n),
    ).not.toThrow();
    expect(() =>
      authorize({ tenantId: 3n, userId: 2n, role: "TENANT_ADMIN" }, 9n),
    ).toThrow();
    expect(() =>
      authorize({ tenantId: 3n, userId: 2n, role: "AGENT" }, null),
    ).toThrow();
  });
});

describe("resolveRequestTenantContext", () => {
  test("null user yields null context", () => {
    expect(resolveRequestTenantContext(null, "5")).toEqual({
      context: null,
      anomaly: false,
    });
  });

  test("super admin without header has a null target", () => {
    const { context } = resolveRequestTenantContext(superAdmin, undefined);
    expect(context?.tenantId).toBeNull();
    expect(context?.role).toBe("SUPER_ADMIN");
  });

  test("super admin selects the target tenant via X-Tenant-Id", () => {
    const { context } = resolveRequestTenantContext(superAdmin, "5");
    expect(context?.tenantId).toBe(5n);
  });

  test("malformed selector for super admin yields a null target", () => {
    const { context } = resolveRequestTenantContext(superAdmin, "not-a-number");
    expect(context?.tenantId).toBeNull();
  });

  test("tenant admin keeps own tenant and flags a forged header as anomaly", () => {
    const ok = resolveRequestTenantContext(tenantAdmin, "3");
    expect(ok.context?.tenantId).toBe(3n);
    expect(ok.anomaly).toBe(false);

    const forged = resolveRequestTenantContext(tenantAdmin, "9");
    expect(forged.context?.tenantId).toBe(3n);
    expect(forged.anomaly).toBe(true);
  });

  test("agent ignores X-Tenant-Id entirely", () => {
    const { context, anomaly } = resolveRequestTenantContext(agent, "9");
    expect(context?.tenantId).toBe(3n);
    expect(anomaly).toBe(true);
  });
});
