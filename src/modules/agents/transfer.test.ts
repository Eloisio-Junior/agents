import { describe, expect, it } from "bun:test";
import {
  collectCredRefs,
  remapConfigBusinessHoursIdToName,
  remapCredRefs,
} from "./transfer";

// Regression: every per-agent credentialRef path must be collected + remapped, or export leaks a
// tenant-local `vault:<id>` and refuses to emit ("unresolved vault reference"). Adding a new
// credential-bearing settings bag (stt → tts → vision → …) means updating both helpers; these
// tests fail loudly if a path is forgotten.

const ALL_PATHS = {
  modelConfig: { provider: "openai", credentialRef: "vault:1" },
  settings: {
    stt: { enabled: true, credentialRef: "vault:2" },
    tts: { enabled: true, credentialRef: "vault:3" },
    vision: { enabled: true, credentialRef: "vault:4" },
  },
};

describe("collectCredRefs", () => {
  it("collects model + stt + tts + vision refs", () => {
    expect(
      collectCredRefs(ALL_PATHS.modelConfig, ALL_PATHS.settings).sort(),
    ).toEqual(["vault:1", "vault:2", "vault:3", "vault:4"]);
  });

  it("ignores missing/empty refs", () => {
    expect(
      collectCredRefs({ provider: "openai" }, { stt: { enabled: false } }),
    ).toEqual([]);
  });
});

describe("remapConfigBusinessHoursIdToName", () => {
  // Integration configs (Google Calendar's businessHoursId) reference a schedule by id; export rewrites
  // it to the schedule NAME so it survives the tenant hop (import resolves it back to the local id).
  const bhNameById = new Map([["7", "Clinic Hours"]]);
  it("rewrites the config businessHoursId id→name", () => {
    expect(
      remapConfigBusinessHoursIdToName(
        { timeZone: "UTC", businessHoursId: "7" },
        bhNameById,
      ),
    ).toEqual({ timeZone: "UTC", businessHoursId: "Clinic Hours" });
  });
  it("leaves a config with no ref (or an unresolved id) untouched", () => {
    expect(
      remapConfigBusinessHoursIdToName({ timeZone: "UTC" }, bhNameById),
    ).toEqual({ timeZone: "UTC" });
    expect(
      remapConfigBusinessHoursIdToName({ businessHoursId: "999" }, bhNameById),
    ).toEqual({ businessHoursId: "999" });
  });
});

describe("remapCredRefs", () => {
  it("rewrites every path (no vault: survives a full id→name map)", () => {
    const names: Record<string, string> = {
      "vault:1": "model-key",
      "vault:2": "stt-key",
      "vault:3": "tts-key",
      "vault:4": "vision-key",
    };
    const { modelConfig, settings } = remapCredRefs(
      ALL_PATHS.modelConfig,
      ALL_PATHS.settings,
      (ref) => names[ref] ?? null,
    );
    expect(JSON.stringify({ modelConfig, settings })).not.toContain("vault:");
    expect(modelConfig.credentialRef).toBe("model-key");
    expect((settings.vision as Record<string, unknown>).credentialRef).toBe(
      "vision-key",
    );
  });

  it("drops a ref the map resolves to null (deleted credential)", () => {
    const { modelConfig, settings } = remapCredRefs(
      ALL_PATHS.modelConfig,
      ALL_PATHS.settings,
      () => null,
    );
    expect(modelConfig.credentialRef).toBeUndefined();
    expect(
      (settings.vision as Record<string, unknown>).credentialRef,
    ).toBeUndefined();
    // The bag itself is preserved, only the ref is removed.
    expect((settings.vision as Record<string, unknown>).enabled).toBe(true);
  });

  it("does not mutate the inputs", () => {
    remapCredRefs(ALL_PATHS.modelConfig, ALL_PATHS.settings, () => "x");
    expect(ALL_PATHS.modelConfig.credentialRef).toBe("vault:1");
    expect(ALL_PATHS.settings.vision.credentialRef).toBe("vault:4");
  });
});
