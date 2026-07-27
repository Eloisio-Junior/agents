import { describe, expect, test } from "bun:test";
import { writeBody } from "@/api/v1/tools.controller";
import { toolDefinitionCreateSchema } from "@/modules/tool-definitions/service";

// Regression guard: Elysia's `normalize` strips any request-body field NOT declared in the route's
// body schema. So every field the service's zod schema accepts MUST also appear in the controller's
// `writeBody`, or it is silently dropped before the service ever sees it. This is exactly how `label`
// once got stripped — the saved label stayed stuck at the backfilled identifier.
describe("tools controller writeBody vs service schema (drift guard)", () => {
  test("every service create field is exposed in the Elysia body schema", () => {
    const bodyKeys = new Set(Object.keys(writeBody.properties));
    const serviceKeys = Object.keys(toolDefinitionCreateSchema.shape);
    const missing = serviceKeys.filter((k) => !bodyKeys.has(k));
    expect(missing).toEqual([]);
  });

  test("label specifically is present (the field that regressed)", () => {
    expect(Object.keys(writeBody.properties)).toContain("label");
  });
});
