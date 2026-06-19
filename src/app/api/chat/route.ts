// ─────────────────────────────────────────────────────────────────────────────
//  Chat API — server-side gateway between the browser and the AI provider.
//
//  Supports OpenRouter (cloud) and Ollama (local). The client consumes a text
//  or NDJSON stream and doesn't care which provider produced it.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import {
  buildOpenRouterReasoning,
  shouldStreamReasoning,
} from "@/lib/openrouter";
import { DEFAULT_OLLAMA_BASE_URL, normalizeOllamaBaseUrl } from "@/lib/providers";
import { extractReasoningText } from "@/lib/reasoning";
import type { ModelProvider, ReasoningSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "openai/gpt-4o-mini";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Open AI Chat UI";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning?: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  provider?: ModelProvider;
  model?: string;
  systemPrompt?: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
  reasoning?: ReasoningSettings;
};

type StreamPart = "content" | "reasoning";

type ReasoningDelta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
  reasoning?: string;
  reasoning_content?: string;
  thinking?: string;
  reasoning_details?: Array<{
    type?: string;
    text?: string;
    summary?: string;
  }>;
};

function encodePart(part: StreamPart, text: string): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({ p: part, t: text })}\n`);
}

function extractDeltaReasoning(delta: ReasoningDelta | undefined | null): string {
  if (!delta) return "";
  if (delta.thinking) return delta.thinking;
  return extractReasoningText(delta);
}

function resolveProvider(value?: string): ModelProvider {
  return value === "ollama" ? "ollama" : "openrouter";
}

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

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const {
    messages,
    model,
    systemPrompt,
    apiKey,
    ollamaBaseUrl,
    reasoning,
    provider: providerInput,
  } = body;
  const provider = resolveProvider(providerInput);

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("`messages` must be a non-empty array.", { status: 400 });
  }

  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const streamReasoning = shouldStreamReasoning(reasoning);
  let upstream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

  if (provider === "ollama") {
    const baseUrl = normalizeOllamaBaseUrl(
      ollamaBaseUrl?.trim() || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
    );
    const resolvedModel = model?.trim() || DEFAULT_OLLAMA_MODEL;

    if (!resolvedModel) {
      return new Response(
        "No Ollama model selected. Choose one in Model providers settings.",
        { status: 400 },
      );
    }

    const client = createOllamaClient(baseUrl);

    try {
      upstream = await client.chat.completions.create({
        model: resolvedModel,
        messages: fullMessages,
        stream: true,
        ...(reasoning?.enabled ? { think: true } : {}),
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upstream error.";
      return new Response(`Ollama error: ${message}`, { status: 502 });
    }
  } else {
    const resolvedKey = apiKey?.trim() || process.env.OPENROUTER_API_KEY;

    if (!resolvedKey) {
      return new Response(
        "No OpenRouter API key. Add one in Model providers or set OPENROUTER_API_KEY in .env.local.",
        { status: 500 },
      );
    }

    const client = createOpenRouterClient(resolvedKey);
    const reasoningParam = buildOpenRouterReasoning(reasoning);

    try {
      upstream = await client.chat.completions.create({
        model: model?.trim() || DEFAULT_MODEL,
        messages: fullMessages,
        stream: true,
        ...(reasoningParam ? { reasoning: reasoningParam } : {}),
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upstream error.";
      return new Response(`OpenRouter error: ${message}`, { status: 502 });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of upstream) {
          const delta = chunk.choices[0]?.delta as ReasoningDelta | undefined;
          const reasoningText = extractDeltaReasoning(delta);
          const contentText = delta?.content;

          if (streamReasoning) {
            if (reasoningText) controller.enqueue(encodePart("reasoning", reasoningText));
            if (contentText) controller.enqueue(encodePart("content", contentText));
          } else if (contentText) {
            controller.enqueue(new TextEncoder().encode(contentText));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      // Client aborted (user clicked Stop).
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": streamReasoning
        ? "application/x-ndjson; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
