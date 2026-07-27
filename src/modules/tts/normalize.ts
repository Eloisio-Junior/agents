import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  type BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { runModelCall } from "@/graph/model-limit";

// LLM text-for-speech normalization. Runs AFTER prepareSpeechText, only when the agent opts in
// (`agent.settings.tts.normalize`) and only on the audio path. Rewrites what a TTS engine reads wrong
// or inconsistently — currency, numbers, dates, times, abbreviations, addresses — into the way it is
// spoken, IN THE SAME LANGUAGE as the reply (so it is not hard-coded to one locale, unlike a regex
// pass would be). Plain text in, plain text out: we never emit SSML (fragmented and brittle across
// providers and model versions — see docs/tts.md).
//
// Best-effort: the CALLER wraps this in try/catch and falls back to the un-normalized text, so a slow
// or failing normalization never blocks or breaks the audio reply.

const NORMALIZE_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT =
  "You prepare an assistant's chat message to be read aloud by a text-to-speech engine. " +
  "Rewrite the user message so it is SPOKEN naturally, in the SAME language, changing ONLY what a TTS " +
  "would read wrong: write currency, numbers, percentages, dates, times, phone numbers, ordinals and " +
  "unit symbols the way they are spoken, and expand common abbreviations (street and title " +
  "abbreviations, etc.). Preserve the wording, tone, meaning, punctuation and line breaks otherwise. " +
  "Do not translate, summarize, answer, add, or remove information. Do not add quotes, markdown, or any " +
  "preface. Output only the rewritten text.";

function messageText(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === "string"
          ? c
          : c && typeof c === "object" && "text" in c
            ? String((c as { text: unknown }).text)
            : "",
      )
      .join("");
  }
  return "";
}

// Rewrites `text` for natural speech via the model. Returns the original text if the model yields
// nothing. Throws on a model/timeout error (the caller falls back to the un-normalized text).
export async function llmNormalizeForSpeech(
  model: BaseChatModel,
  text: string,
): Promise<string> {
  const res = await runModelCall(() =>
    model.invoke([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(text)], {
      signal: AbortSignal.timeout(NORMALIZE_TIMEOUT_MS),
    }),
  );
  const out = messageText(res.content).trim();
  return out || text;
}
