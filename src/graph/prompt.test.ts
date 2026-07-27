import { describe, expect, it } from "bun:test";
import {
  findExactTimeVarUsages,
  interpolatePromptVars,
  TIME_ROUND_MINUTES,
  timeVarKind,
} from "./prompt";

describe("timeVarKind", () => {
  it("marks the slot-floored time vars as rounded", () => {
    expect(timeVarKind("hora_atual")).toBe("rounded");
    expect(timeVarKind("current_time")).toBe("rounded");
    expect(timeVarKind("data_hora_atual")).toBe("rounded");
  });
  it("marks the exact time-of-day vars as exact", () => {
    expect(timeVarKind("hora_atual_exata")).toBe("exact");
    expect(timeVarKind("current_time_exact")).toBe("exact");
  });
  it("marks date-only vars as date (stable within a day)", () => {
    expect(timeVarKind("data_atual")).toBe("date");
    expect(timeVarKind("current_date")).toBe("date");
  });
  it("returns null for non-time and unknown vars", () => {
    expect(timeVarKind("nome_contato")).toBeNull();
    expect(timeVarKind("desconhecida")).toBeNull();
  });
});

describe("findExactTimeVarUsages", () => {
  it("flags an exact time var and suggests its rounded sibling", () => {
    expect(findExactTimeVarUsages("Agora são {{hora_atual_exata}}.")).toEqual([
      { name: "hora_atual_exata", suggestion: "hora_atual" },
    ]);
    expect(findExactTimeVarUsages("Now: {{current_time_exact}}")).toEqual([
      { name: "current_time_exact", suggestion: "current_time" },
    ]);
  });
  it("ignores rounded, date and non-time vars", () => {
    expect(
      findExactTimeVarUsages("{{hora_atual}} {{data_atual}} {{nome_contato}}"),
    ).toEqual([]);
  });
  it("dedupes repeated usages of the same var", () => {
    expect(
      findExactTimeVarUsages("{{hora_atual_exata}} … {{hora_atual_exata}}"),
    ).toEqual([{ name: "hora_atual_exata", suggestion: "hora_atual" }]);
  });
});

describe("interpolatePromptVars time rounding", () => {
  // 14:37 is off the 30-min slot, so rounded vs exact must differ (the caching contract).
  const now = new Date("2026-06-18T14:37:00-03:00");
  it("floors a rounded time var to the slot", () => {
    expect(interpolatePromptVars("{{hora_atual}}", {}, { now })).toBe("14:30");
  });
  it("keeps an exact time var precise", () => {
    expect(interpolatePromptVars("{{hora_atual_exata}}", {}, { now })).toBe(
      "14:37",
    );
  });
  it("defaults to a 30-minute rounding slot", () => {
    expect(TIME_ROUND_MINUTES).toBe(30);
  });
});
