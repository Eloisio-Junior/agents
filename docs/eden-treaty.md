# Eden treaty conventions

Two rules to keep the API client honest. Both exist because Eden's defaults silently misalign with how this template uses TypeScript.

## 1. `parseDate: false` on the treaty client

Set in `src/client/lib/api.ts`. **Do not remove.**

Eden's default `parseDate: true` runs every JSON response through a reviver that detects strings matching an ISO 8601 / RFC 1123 / `dd/mm/yyyy` regex and replaces them with `new Date(...)` before returning. The conversion is invisible to the type system, so it produces two failure modes that are expensive to debug:

- **Runtime guards break.** `typeof v.expiresAt === "string"` returns `"object"` for `Date` instances, so any narrowing guard silently rejects valid responses.
- **React identity comparisons break.** Each parse yields a fresh `Date` instance, so `useEffect` / `useMemo` deps that include a date field fire on every fetch, and `prev.updatedAt === next.updatedAt` is always `false`.

With `parseDate: false`, all date fields stay as ISO strings end-to-end (wire format = runtime format). The `formatDate` helper in `src/client/lib/utils.ts` already accepts `string | Date`, so call sites do not change.

If a call site truly needs a `Date`, wrap the string explicitly: `new Date(user.createdAt)`. Do not re-enable the global flag.

## 2. Never hand-declare a type that mirrors an API response

Always derive client-side types from the Eden client. The wire-format type (where Prisma `Date` columns flatten to `string`) is what Eden returns; a hand-written interface is a duplicate that drifts the moment the controller changes its `select`, adds a field, or renames one.

### Anti-pattern

```ts
// src/client/pages/AdminPage.tsx
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;        // ← loses the "USER" | "ADMIN" union
  createdAt: Date;     // ← wrong: with parseDate: false, runtime is string
  lastLoginAt: Date | null;
}
```

The shape compiles, but every field is a guess. The `role` union widens to `string` and breaks exhaustiveness checks; `createdAt: Date` lies about the runtime value; adding a field on the server is invisible until the next manual sync.

### Pattern

```ts
import { api } from "@/client/lib/api";

type UsersResponse = Awaited<
  ReturnType<typeof api.api.admin.users.get>
>["data"];
type StatsResponse = Awaited<
  ReturnType<typeof api.api.admin.stats.get>
>["data"];

type AdminUser = NonNullable<UsersResponse>["users"][number];
type AdminStats = NonNullable<StatsResponse>["stats"];
```

Renames, additions, and union widenings on the server propagate to the client at the next `tsc` pass. The `NonNullable<...>` unwraps Eden's `data: T | undefined` envelope (it is `undefined` when the response fails, but inside a `if (data)` branch the call site already narrows).

For nested fetches (e.g. `api.api.admin.users({ id }).licenses.get`), repeat the pattern with `ReturnType<ReturnType<typeof api.api.admin.users>["licenses"]["get"]>`.

If you need to override a single field (e.g. typing a `Json` column more strictly), use `Omit<Base, "field"> & { field: BetterType }` instead of redeclaring the whole shape.
