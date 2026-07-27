import { describe, expect, test } from "bun:test";
import { decryptJson, encryptJson } from "@/api/lib/crypto";

describe("crypto", () => {
  test("encrypts and decrypts a string", () => {
    const data = "hello world";
    const encrypted = encryptJson(data);
    expect(encrypted).not.toBe(data);
    expect(decryptJson<string>(encrypted)).toBe(data);
  });

  test("encrypts and decrypts an object", () => {
    const data = { apiKey: "sk-123", nested: { token: "abc" } };
    const encrypted = encryptJson(data);
    expect(decryptJson<typeof data>(encrypted)).toEqual(data);
  });

  test("produces different ciphertext for the same input", () => {
    const data = { secret: "test" };
    const a = encryptJson(data);
    const b = encryptJson(data);
    expect(a).not.toBe(b);
  });

  test("throws on tampered ciphertext", () => {
    const encrypted = encryptJson("test");
    const tampered = `${encrypted.slice(0, -2)}AA`;
    expect(() => decryptJson(tampered)).toThrow();
  });

  test("handles null and empty values", () => {
    expect(decryptJson<null>(encryptJson(null))).toBeNull();
    expect(decryptJson<string>(encryptJson(""))).toBe("");
    expect(decryptJson<never[]>(encryptJson([]))).toEqual([]);
  });
});
