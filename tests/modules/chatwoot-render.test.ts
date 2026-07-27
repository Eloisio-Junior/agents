import { describe, expect, test } from "bun:test";
import {
  cleanTranscription,
  renderInboundMessage,
} from "@/modules/chatwoot/render";

describe("cleanTranscription", () => {
  test("drops Whisper's Amara.org silence hallucination", () => {
    expect(cleanTranscription("Legendas pela comunidade Amara.org")).toBe("");
    expect(cleanTranscription("  olá tudo bem  ")).toBe("olá tudo bem");
  });
});

describe("renderInboundMessage", () => {
  test("plain text passes through", () => {
    expect(
      renderInboundMessage({ text: "quero agendar", attachmentTypes: [] }),
    ).toBe("quero agendar");
  });

  test("audio renders the transcription wrapped in a modality marker", () => {
    expect(
      renderInboundMessage({
        text: "",
        transcribedText: "quero remarcar minha consulta",
        attachmentTypes: ["audio"],
      }),
    ).toBe(
      "<mensagem-de-audio>quero remarcar minha consulta</mensagem-de-audio>",
    );
  });

  test("audio without a transcription renders the inaudible marker", () => {
    const out = renderInboundMessage({
      text: "",
      transcribedText: "",
      attachmentTypes: ["audio"],
    });
    expect(out).toContain("não audível");
  });

  test("image without a description renders the send-text marker", () => {
    expect(
      renderInboundMessage({ text: "", attachmentTypes: ["image"] }),
    ).toContain("enviou uma imagem");
  });

  test("an extracted image renders the description in an <imagem> marker", () => {
    expect(
      renderInboundMessage({
        text: "",
        imageDescription: "uma nota fiscal no valor de R$ 120",
        attachmentTypes: ["image"],
      }),
    ).toBe("<imagem>uma nota fiscal no valor de R$ 120</imagem>");
  });

  test("an extracted document renders the content in a <documento> marker", () => {
    expect(
      renderInboundMessage({
        text: "",
        extractedText: "Contrato de prestação de serviços…",
        attachmentTypes: ["file"],
      }),
    ).toBe("<documento>Contrato de prestação de serviços…</documento>");
  });

  test("an unsupported file renders a could-not-extract marker with name + type", () => {
    expect(
      renderInboundMessage({
        text: "",
        attachmentTypes: ["file"],
        attachmentName: "planilha.xlsx",
      }),
    ).toBe(
      "<usuário enviou um arquivo do tipo 'file' chamado 'planilha.xlsx'; não foi possível extrair o conteúdo>",
    );
  });

  test("empty with no attachments renders nothing (skip)", () => {
    expect(renderInboundMessage({ text: "   ", attachmentTypes: [] })).toBe("");
  });

  test("a quoted message is prefixed when resolvable", () => {
    const out = renderInboundMessage(
      { text: "sim, pode ser", attachmentTypes: [], inReplyTo: 42 },
      { resolveQuoted: (id) => (id === 42 ? "Podemos marcar quinta?" : null) },
    );
    expect(out).toBe(
      '<em resposta a: "Podemos marcar quinta?">\nsim, pode ser',
    );
  });

  test("an unresolvable quote is silently ignored", () => {
    const out = renderInboundMessage(
      { text: "ok", attachmentTypes: [], inReplyTo: 99 },
      { resolveQuoted: () => null },
    );
    expect(out).toBe("ok");
  });

  test("a reaction renders as a context marker with the reacted-to snippet", () => {
    const out = renderInboundMessage(
      { text: "❤️", attachmentTypes: [], isReaction: true, inReplyTo: 7 },
      { resolveQuoted: (id) => (id === 7 ? "Segue o orçamento" : null) },
    );
    expect(out).toBe('<reação do cliente emoji="❤️" para: "Segue o orçamento">');
  });

  test("a reaction with no resolvable target still renders the emoji marker", () => {
    const out = renderInboundMessage({
      text: "👍",
      attachmentTypes: [],
      isReaction: true,
    });
    expect(out).toBe('<reação do cliente emoji="👍">');
  });
});
