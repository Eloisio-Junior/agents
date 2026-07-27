import { describe, expect, test } from "bun:test";
import { CalculatorError, evaluateExpression } from "@/graph/tools/calculator";

describe("evaluateExpression", () => {
  test("respects operator precedence", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("2 ^ 3 ^ 2")).toBe(512); // right-associative
    expect(evaluateExpression("-2 ^ 2")).toBe(-4); // unary binds looser than ^
  });

  test("handles decimals, modulo and unary signs", () => {
    expect(evaluateExpression("12.5 * 2")).toBe(25);
    expect(evaluateExpression(".5 + .25")).toBe(0.75);
    expect(evaluateExpression("10 % 3")).toBe(1);
    expect(evaluateExpression("-(3 + 4)")).toBe(-7);
    expect(evaluateExpression("+5")).toBe(5);
  });

  test("throws on division by zero", () => {
    expect(() => evaluateExpression("1 / 0")).toThrow(CalculatorError);
    expect(() => evaluateExpression("5 % 0")).toThrow(CalculatorError);
  });

  test("throws on malformed input", () => {
    expect(() => evaluateExpression("")).toThrow(CalculatorError);
    expect(() => evaluateExpression("2 +")).toThrow(CalculatorError);
    expect(() => evaluateExpression("2 ** 3")).toThrow(CalculatorError);
    expect(() => evaluateExpression("(1 + 2")).toThrow(CalculatorError);
    expect(() => evaluateExpression("1 + abc")).toThrow(CalculatorError);
    expect(() => evaluateExpression("1.2.3")).toThrow(CalculatorError);
  });
});
