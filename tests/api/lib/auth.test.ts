import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

import { authPlugin } from "@/api/lib/auth";

const mockUser = {
  id: BigInt(1),
  tenantId: BigInt(1) as bigint | null,
  email: "test@example.com",
  name: null as string | null,
  passwordHash: "$2b$10$hashedpassword",
  role: "AGENT" as const,
  googleId: null as string | null,
};

const mockPrisma = {
  user: {
    findUnique: mock(
      (): Promise<typeof mockUser | null> => Promise.resolve(null),
    ),
  },
};

mock.module("@/api/lib/prisma", () => ({
  default: mockPrisma,
}));

function base64urlToBase64(input: string): string {
  const replaced = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (replaced.length % 4)) % 4;
  return replaced + "=".repeat(padLen);
}

describe("authPlugin", () => {
  beforeEach(() => {
    // NOTE: mockClear preserves the default Promise.resolve(null) stub; using
    // mockReset here would strip it and later tests would receive `undefined`
    // from findUnique() instead of a Prisma-shaped async result.
    mockPrisma.user.findUnique.mockClear();
  });

  describe("setAuthCookie", () => {
    test("returns valid JWT token with correct structure", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .post("/test-set-cookie", async ({ setAuthCookie }) => {
          const token = await setAuthCookie(mockUser);
          return { token };
        });

      const response = await app.handle(
        new Request("http://localhost/test-set-cookie", { method: "POST" }),
      );

      expect(response.status).toBe(200);
      // NOTE: happy-dom (registered via tests/setup.ts) strips `Set-Cookie`
      // from Response headers as a forbidden response header. The cookie
      // side effect is therefore only observable indirectly through the
      // JWT returned by `setAuthCookie`, which we assert below.
      const data = await response.json();
      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe("string");

      const parts = data.token.split(".");
      expect(parts).toHaveLength(3);

      const payload = JSON.parse(atob(base64urlToBase64(parts[1])));
      expect(payload.userId).toBe(mockUser.id.toString());
      expect(payload.email).toBe(mockUser.email);
      expect(payload.role).toBe(mockUser.role);
    });

    test("includes expiration in JWT token", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .post("/test-set-cookie", async ({ setAuthCookie }) => {
          const token = await setAuthCookie(mockUser);
          return { token };
        });

      const response = await app.handle(
        new Request("http://localhost/test-set-cookie", { method: "POST" }),
      );

      const data = await response.json();
      const parts = data.token.split(".");
      const payload = JSON.parse(atob(base64urlToBase64(parts[1])));

      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });
  });

  describe("clearAuthCookie", () => {
    test("executes without error", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .post("/test-clear-cookie", ({ clearAuthCookie }) => {
          clearAuthCookie();
          return { success: true };
        });

      const response = await app.handle(
        new Request("http://localhost/test-clear-cookie", {
          method: "POST",
          headers: { Cookie: "auth_token=some_token" },
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("getAuthUser", () => {
    test("returns null when no cookie present", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/test-get-user", async ({ getAuthUser }) => {
          const user = await getAuthUser();
          return { user };
        });

      const response = await app.handle(
        new Request("http://localhost/test-get-user"),
      );

      const data = await response.json();
      expect(data.user).toBeNull();
    });

    test("returns null for invalid token", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/test-get-user", async ({ getAuthUser }) => {
          const user = await getAuthUser();
          return { user };
        });

      const response = await app.handle(
        new Request("http://localhost/test-get-user", {
          headers: { Cookie: "auth_token=invalid_token" },
        }),
      );

      const data = await response.json();
      expect(data.user).toBeNull();
    });

    test("returns null for malformed JWT", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/test-get-user", async ({ getAuthUser }) => {
          const user = await getAuthUser();
          return { user };
        });

      const response = await app.handle(
        new Request("http://localhost/test-get-user", {
          headers: { Cookie: "auth_token=not.a.valid.jwt.token" },
        }),
      );

      const data = await response.json();
      expect(data.user).toBeNull();
    });
  });

  describe("requireAuth macro", () => {
    test("rejects unauthenticated requests with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/protected", () => ({ message: "secret data" }), {
          requireAuth: true,
        });

      const response = await app.handle(
        new Request("http://localhost/protected"),
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    test("rejects requests with invalid token with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/protected", () => ({ message: "secret data" }), {
          requireAuth: true,
        });

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Cookie: "auth_token=invalid" },
        }),
      );

      expect(response.status).toBe(401);
    });
  });

  describe("requireAdmin macro", () => {
    test("rejects unauthenticated users with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/admin", () => ({ message: "admin data" }), {
          requireAdmin: true,
        });

      const response = await app.handle(new Request("http://localhost/admin"));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    test("rejects requests with invalid token with 401", async () => {
      const app = new Elysia()
        .use(authPlugin)
        .get("/admin", () => ({ message: "admin data" }), {
          requireAdmin: true,
        });

      const response = await app.handle(
        new Request("http://localhost/admin", {
          headers: { Cookie: "auth_token=invalid" },
        }),
      );

      expect(response.status).toBe(401);
    });
  });
});
