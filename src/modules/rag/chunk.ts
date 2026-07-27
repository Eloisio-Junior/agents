import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Splits source text (markdown / plain text) into overlapping chunks for embedding. Recursive
// character splitting keeps semantically-close text together (paragraphs → sentences → words).
// Pure and deterministic — the RAG service embeds the output outside any transaction.

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export async function chunkText(
  text: string,
  opts: ChunkOptions = {},
): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: opts.chunkSize ?? 1000,
    chunkOverlap: opts.chunkOverlap ?? 150,
  });
  const chunks = await splitter.splitText(trimmed);
  return chunks.map((c) => c.trim()).filter(Boolean);
}
