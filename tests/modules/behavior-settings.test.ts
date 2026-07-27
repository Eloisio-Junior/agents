import { describe, expect, test } from "bun:test";
import {
  BEHAVIOR_SETTINGS_KEYS,
  mergeBehaviorSettings,
  readBehaviorSettings,
} from "@/modules/agents/behavior-settings";

// vision is part of the shared behavior surface (so it is settable via the MCP agent_settings_set
// partial-merge path, like stt/tts). These cover the wiring without a DB.
describe("behavior-settings — vision", () => {
  test("vision is an owned key and projects defaults when absent", () => {
    expect(BEHAVIOR_SETTINGS_KEYS).toContain("vision");
    const b = readBehaviorSettings({});
    expect(b.vision.enabled).toBe(false);
    expect(b.vision.provider).toBe("openai");
  });

  test("a partial vision patch merges + normalizes; unknown bag keys are preserved", () => {
    const current = {
      foo: "keep",
      vision: { enabled: false, provider: "openai" },
    };
    const next = mergeBehaviorSettings(current, {
      vision: { enabled: true, provider: "gemini", credentialRef: "vault:5" },
    });
    const v = next.vision as Record<string, unknown>;
    expect(v.enabled).toBe(true);
    expect(v.provider).toBe("gemini");
    expect(v.credentialRef).toBe("vault:5");
    // a non-behavior key in the bag survives the merge
    expect(next.foo).toBe("keep");
  });

  test("an unknown vision provider is clamped to the default on write", () => {
    const next = mergeBehaviorSettings(
      {},
      { vision: { enabled: true, provider: "bogus" } },
    );
    const v = next.vision as Record<string, unknown>;
    expect(v.provider).toBe("openai");
    expect(v.enabled).toBe(true);
  });
});
