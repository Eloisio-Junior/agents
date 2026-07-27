import { describe, expect, test } from "bun:test";
import { readToolGuidance } from "@/modules/agents/tool-guidance";

describe("readToolGuidance", () => {
  test("keeps valid native-tool keys with trimmed text", () => {
    const g = readToolGuidance({
      toolGuidance: {
        set_custom_attribute: "  grave lead_stage  ",
        assign_label: "vip = premium",
      },
    });
    expect(g).toEqual({
      set_custom_attribute: "grave lead_stage",
      assign_label: "vip = premium",
    });
  });

  test("drops unknown keys and blank values", () => {
    const g = readToolGuidance({
      toolGuidance: {
        not_a_tool: "ignore me",
        assign_label: "   ",
        set_custom_attribute: "",
      },
    });
    expect(g).toEqual({});
  });

  test("absent / malformed settings → empty map", () => {
    expect(readToolGuidance(undefined)).toEqual({});
    expect(readToolGuidance({})).toEqual({});
    expect(readToolGuidance({ toolGuidance: "nope" })).toEqual({});
    expect(readToolGuidance({ toolGuidance: ["nope"] })).toEqual({});
  });

  test("caps overly long notes", () => {
    const g = readToolGuidance({
      toolGuidance: { assign_label: "x".repeat(5000) },
    });
    expect((g.assign_label ?? "").length).toBeLessThanOrEqual(1500);
  });
});
