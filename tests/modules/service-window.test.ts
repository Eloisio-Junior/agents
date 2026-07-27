import { describe, expect, test } from "bun:test";
import {
  buildTemplatePayload,
  isWithinServiceWindow,
  proactiveSendMode,
  readServiceWindowConfig,
  SERVICE_WINDOW_DEFAULTS,
} from "@/modules/service-window/service";

const NOW = new Date("2026-06-06T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("readServiceWindowConfig", () => {
  test("defaults: enabled, 24h, no template", () => {
    expect(readServiceWindowConfig(undefined)).toEqual(SERVICE_WINDOW_DEFAULTS);
    expect(readServiceWindowConfig({ serviceWindow: {} }).windowHours).toBe(24);
  });
  test("clamps windowHours and reads template fields", () => {
    const c = readServiceWindowConfig({
      serviceWindow: {
        windowHours: 9999,
        templateName: "reengajamento",
        templateParams: ["{primeiro_nome}", 5, "fixo"],
      },
    });
    expect(c.windowHours).toBe(168);
    expect(c.templateName).toBe("reengajamento");
    expect(c.templateParams).toEqual(["{primeiro_nome}", "fixo"]);
  });
});

describe("isWithinServiceWindow", () => {
  test("null inbound → outside (business-initiated)", () => {
    expect(isWithinServiceWindow(null, NOW, 24)).toBe(false);
  });
  test("recent inbound → inside; old → outside", () => {
    expect(isWithinServiceWindow(hoursAgo(2), NOW, 24)).toBe(true);
    expect(isWithinServiceWindow(hoursAgo(25), NOW, 24)).toBe(false);
  });
});

describe("proactiveSendMode", () => {
  const base = { ...SERVICE_WINDOW_DEFAULTS };
  // Official WhatsApp providers (have a 24h window): Cloud API + 360dialog (provider "default").
  const cloud = {
    channelType: "Channel::Whatsapp",
    provider: "whatsapp_cloud",
  };
  const dialog360 = { channelType: "Channel::Whatsapp", provider: "default" };
  test("gate disabled → freeform regardless", () => {
    expect(
      proactiveSendMode({ ...base, enabled: false }, hoursAgo(100), NOW, cloud),
    ).toBe("freeform");
  });
  test("inside window → freeform", () => {
    expect(proactiveSendMode(base, hoursAgo(2), NOW, cloud)).toBe("freeform");
  });
  test("outside window + template → template (Cloud + 360dialog)", () => {
    const withTpl = { ...base, templateName: "reengajamento" };
    expect(proactiveSendMode(withTpl, hoursAgo(48), NOW, cloud)).toBe(
      "template",
    );
    expect(proactiveSendMode(withTpl, hoursAgo(48), NOW, dialog360)).toBe(
      "template",
    );
  });
  test("outside window + no template → note", () => {
    expect(proactiveSendMode(base, hoursAgo(48), NOW, cloud)).toBe("note");
  });
  test("unofficial WhatsApp providers (baileys/zapi) → freeform even outside the window", () => {
    // baileys/zapi arrive as Channel::Whatsapp too, but with no 24h window — channel_type alone would
    // wrongly gate them; the provider is what excludes them. A template never overrides this.
    const withTpl = { ...base, templateName: "reengajamento" };
    for (const provider of ["baileys", "zapi"]) {
      const ch = { channelType: "Channel::Whatsapp", provider };
      expect(proactiveSendMode(base, hoursAgo(100), NOW, ch)).toBe("freeform");
      expect(proactiveSendMode(withTpl, hoursAgo(100), NOW, ch)).toBe(
        "freeform",
      );
    }
  });
  test("unknown/null provider or non-WhatsApp channel → freeform (no window)", () => {
    expect(
      proactiveSendMode(base, hoursAgo(100), NOW, {
        channelType: "Channel::Whatsapp",
        provider: null,
      }),
    ).toBe("freeform");
    expect(
      proactiveSendMode(base, hoursAgo(100), NOW, {
        channelType: "Channel::Api",
        provider: null,
      }),
    ).toBe("freeform");
  });
});

describe("buildTemplatePayload", () => {
  test("interpolates the contact name and builds positional body params", () => {
    const cfg = {
      ...SERVICE_WINDOW_DEFAULTS,
      templateName: "reengajamento",
      templateLanguage: "pt_BR",
      templateParams: ["{{primeiro_nome}}", "promo"],
    };
    const payload = buildTemplatePayload(cfg, "Maria Silva");
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe("reengajamento");
    expect(payload?.language).toBe("pt_BR");
    expect(payload?.processedParams).toEqual({
      body: { "1": "Maria", "2": "promo" },
    });
  });
  test("returns null when no template is configured", () => {
    expect(buildTemplatePayload(SERVICE_WINDOW_DEFAULTS, "Maria")).toBeNull();
  });
});
