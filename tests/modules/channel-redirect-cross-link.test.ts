import { describe, expect, test } from "bun:test";
import {
  chatSideNote,
  conversationUrl,
  shouldPropagateTestMode,
  whatsappSideNote,
} from "@/modules/channel-redirect/cross-link";

describe("conversationUrl", () => {
  test("builds the operator dashboard deep link", () => {
    expect(conversationUrl("http://localhost:3010", 1, 17)).toBe(
      "http://localhost:3010/app/accounts/1/conversations/17",
    );
  });

  test("strips a trailing slash on the base URL", () => {
    expect(conversationUrl("http://cw.local:3010/", 2, 5)).toBe(
      "http://cw.local:3010/app/accounts/2/conversations/5",
    );
  });
});

describe("shouldPropagateTestMode", () => {
  const activated = new Date("2026-07-06T12:00:00Z");

  test("propagates when test mode + sibling active + widget inactive", () => {
    expect(shouldPropagateTestMode("test", activated, null)).toBe(true);
  });

  test("does not propagate in production mode", () => {
    expect(shouldPropagateTestMode("production", activated, null)).toBe(false);
  });

  test("does not propagate when the WhatsApp sibling was never activated", () => {
    expect(shouldPropagateTestMode("test", null, null)).toBe(false);
  });

  test("does not propagate when the widget is already activated", () => {
    expect(shouldPropagateTestMode("test", activated, activated)).toBe(false);
  });
});

describe("cross-link notes", () => {
  test("whatsapp-side note points at the chat conversation URL", () => {
    const note = whatsappSideNote("http://x/app/accounts/1/conversations/17");
    expect(note).toContain("chat do site");
    expect(note).toContain("http://x/app/accounts/1/conversations/17");
  });

  test("chat-side note points at the WhatsApp conversation URL", () => {
    const note = chatSideNote("http://x/app/accounts/1/conversations/14");
    expect(note).toContain("WhatsApp");
    expect(note).toContain("http://x/app/accounts/1/conversations/14");
  });
});
