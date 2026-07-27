import { describe, expect, test } from "bun:test";
import config from "@/config";
import { IS_FREE } from "@/lib/edition";
import { ProEditionError } from "@/lib/errors";

// The master (and the test env) run as Full. This guard prevents an accidental flip of the default
// that would silently gate/strip Pro surfaces in the master and break its tests.
describe("edition", () => {
  test("defaults to the Full edition", () => {
    expect(config.edition).toBe("full");
    expect(IS_FREE).toBe(false);
  });

  test("ProEditionError is a 403 carrying the user-facing i18n key", () => {
    const err = new ProEditionError();
    expect(err.statusCode).toBe(403);
    expect(err.translationKey).toBe("errors.proEdition");
  });
});
