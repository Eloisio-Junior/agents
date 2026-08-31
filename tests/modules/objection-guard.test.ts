import { describe, expect, test } from "bun:test";
import { decideObjectionGuard } from "@/modules/objection-guard/guard";
import type { ObjectionGuardConfig } from "@/modules/objection-guard/settings";

const config: ObjectionGuardConfig = {
  enabled: true,
  openObjectionPatterns: [
    "está caro",
    "não sei se vale a pena",
    "tenho dúvida",
    "não tenho certeza",
  ],
  definitiveRefusalPatterns: [
    "não tenho interesse",
    "não quero",
    "vou pensar e depois vejo",
    "vou deixar para depois",
    "parem de me mandar mensagem",
  ],
};

describe("objection guard", () => {
  test.each([
    "Está caro, não sei se vale a pena.",
    "ESTA CARO!",
    "Tenho dúvida sobre o pagamento.",
  ])("blocks an open objection: %s", (message) => {
    expect(decideObjectionGuard(config, message)).toBe(
      "blocked_open_objection",
    );
  });

  test.each([
    "Não tenho interesse.",
    "Vou pensar e depois vejo.",
    "Está caro e não tenho interesse.",
    "Parem de me mandar mensagem.",
  ])("allows a definitive refusal or opt-out: %s", (message) => {
    expect(decideObjectionGuard(config, message)).toBe("allow");
  });

  test("does nothing while disabled", () => {
    expect(
      decideObjectionGuard({ ...config, enabled: false }, "Está caro."),
    ).toBe("allow");
  });
});
