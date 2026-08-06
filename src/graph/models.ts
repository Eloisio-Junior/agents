import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { AppError } from "@/lib/errors";
import type { ModelConfig } from "./model-config";

// Per-agent/per-node model factory. The config SCHEMA lives in ./model-config (LangChain-free, so
// the config/HTTP layer validates without importing the provider SDKs); this module turns a
// validated config into a LangChain chat model. The API key is resolved from the vault by the
// caller (never inlined here, never logged). An OpenAI-compatible endpoint is reached by setting
// baseURL on the OpenAI client.

export {
  MODEL_PROVIDERS,
  type ModelConfig,
  modelConfigSchema,
  parseModelConfig,
} from "./model-config";

export interface ResolvedModelConfig extends ModelConfig {
  apiKey: string;
}

// OpenRouter is OpenAI-compatible with a fixed API root, so it reuses the ChatOpenAI client with this
// base URL instead of asking the operator for one (unlike the generic "openai-compatible" provider).
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function createChatModel(cfg: ResolvedModelConfig): BaseChatModel {
  const { model, apiKey, temperature } = cfg;
  switch (cfg.provider) {
    case "openai":
      return new ChatOpenAI({ model, apiKey, temperature });
    case "openai-compatible":
      if (!cfg.baseURL) {
        throw new AppError("openai-compatible provider requires baseURL", 400);
      }
      return new ChatOpenAI({
        // Empty model = "the server's default" (see model-config): send a neutral placeholder so
        // the request is well-formed; llama.cpp-style single-model servers ignore the name.
        model: model.trim() || "default",
        apiKey,
        temperature,
        configuration: { baseURL: cfg.baseURL },
      });
    case "openrouter":
      return new ChatOpenAI({
        model,
        apiKey,
        temperature,
        configuration: { baseURL: cfg.baseURL || OPENROUTER_BASE_URL },
      });
    case "anthropic":
      return new ChatAnthropic({ model, apiKey, temperature });
    case "google":
      return new ChatGoogleGenerativeAI({ model, apiKey, temperature });
    case "deepseek":
      return new ChatDeepSeek({ model, apiKey, temperature });
    default:
      throw new AppError(`unknown model provider: ${cfg.provider}`, 400);
  }
}
