import OpenAI from "openai";
import { DEFAULT_OLLAMA_BASE_URL, normalizeOllamaBaseUrl } from "@/lib/providers";
import type { ModelProvider } from "@/lib/types";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "x-ai/grok-4.3";
const DEFAULT_TITLE_MODEL =
  process.env.DEFAULT_TITLE_MODEL ?? "google/gemini-2.0-flash-001";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Open AI Chat UI";

export type CompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompletionOptions = {
  provider: ModelProvider;
  model?: string;
  messages: CompletionMessage[];
  apiKey?: string;
  ollamaBaseUrl?: string;
  /** When true, use DEFAULT_TITLE_MODEL instead of DEFAULT_MODEL for OpenRouter. */
  useTitleDefault?: boolean;
};

function createOpenRouterClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME,
    },
  });
}

function createOllamaClient(baseUrl: string) {
  return new OpenAI({
    apiKey: "ollama",
    baseURL: `${normalizeOllamaBaseUrl(baseUrl)}/v1`,
  });
}

export async function completeChat(options: CompletionOptions): Promise<string> {
  const { provider, messages, apiKey, ollamaBaseUrl, useTitleDefault } = options;

  if (provider === "ollama") {
    const baseUrl = normalizeOllamaBaseUrl(
      ollamaBaseUrl?.trim() || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
    );
    const resolvedModel = options.model?.trim() || DEFAULT_OLLAMA_MODEL;
    if (!resolvedModel) {
      throw new Error("No Ollama model selected for title generation.");
    }

    const client = createOllamaClient(baseUrl);
    const response = await client.chat.completions.create({
      model: resolvedModel,
      messages,
      stream: false,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  }

  const resolvedKey = apiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!resolvedKey) {
    throw new Error(
      "No OpenRouter API key. Add one in Model providers or set OPENROUTER_API_KEY in .env.local.",
    );
  }

  const fallbackModel = useTitleDefault ? DEFAULT_TITLE_MODEL : DEFAULT_MODEL;
  const client = createOpenRouterClient(resolvedKey);
  const response = await client.chat.completions.create({
    model: options.model?.trim() || fallbackModel,
    messages,
    stream: false,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}
