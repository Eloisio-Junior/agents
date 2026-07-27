// Normalizes an operator-facing tool name (which may carry spaces, accents, mixed case) into a
// provider-valid LLM tool name: NFD-strip diacritics, lowercase, map any other non [a-z0-9_-] char
// to "_", collapse repeats, trim leading/trailing "_", cap 64. Empty → "tool". Pure + dependency-free
// so it is shared by the build (sanitizeToolName) AND mirrored live in the editor, so the operator
// sees the exact internal name before saving ("Busca por CPF/CNPJ" → "busca_por_cpf_cnpj").
export function normalizeToolName(name: string): string {
  const out = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return out || "tool";
}
