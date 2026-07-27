// The default image/document extraction prompt, kept in a dependency-free leaf so the client editor
// can import it (to prefill the field + offer "reset to default") without pulling the server-side
// vision stack (providers, fetch, vault). Re-exported from ./settings for server callers.
export const DEFAULT_EXTRACTION_PROMPT =
  "Descreva objetivamente o conteúdo deste arquivo, transcrevendo todo o texto visível e os dados relevantes. Responda apenas com o conteúdo, sem comentários nem suposições.";
