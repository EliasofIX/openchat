// ─────────────────────────────────────────────────────────────────────────────
//  Chat API — server-side gateway between the browser and the AI provider.
//
//  Supports OpenRouter (cloud) and Ollama (local). The client consumes a text
//  or NDJSON stream and doesn't care which provider produced it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createAiClient,
  type ChatCompletionDelta,
  type ChatMessage,
} from "@/lib/ai-client";
import {
  buildOpenRouterReasoning,
  hermesReasoningSystemDirective,
  shouldStreamReasoning,
} from "@/lib/openrouter";
import { DEFAULT_OLLAMA_BASE_URL, normalizeOllamaBaseUrl } from "@/lib/providers";
import {
  createPlainReasoningSplitter,
  createThinkingTagSplitter,
  extractReasoningText,
  reconcileReasoningAndContent,
} from "@/lib/reasoning";
import type { ModelProvider, ReasoningSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "x-ai/grok-4.3";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Open AI Chat UI";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ApiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
  reasoning?: string;
};

type ChatRequest = {
  messages: ApiChatMessage[];
  provider?: ModelProvider;
  model?: string;
  systemPrompt?: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
  reasoning?: ReasoningSettings;
};

type StreamPart = "content" | "reasoning";

const textEncoder = new TextEncoder();

function encodePart(part: StreamPart, text: string): Uint8Array {
  return textEncoder.encode(`${JSON.stringify({ p: part, t: text })}\n`);
}

function extractDeltaReasoning(delta: ChatCompletionDelta | undefined | null): string {
  if (!delta) return "";
  if (delta.thinking) return delta.thinking;
  return extractReasoningText(delta);
}

function hasDedicatedReasoning(delta: ChatCompletionDelta | undefined | null): boolean {
  if (!delta) return false;
  if (delta.thinking) return true;
  if (delta.reasoning || delta.reasoning_content) return true;
  return Boolean(delta.reasoning_details?.length);
}

function resolveProvider(value?: string): ModelProvider {
  return value === "ollama" ? "ollama" : "openrouter";
}

function withReasoningSystemPrompt(
  messages: ChatMessage[],
  model: string,
  reasoning?: ReasoningSettings,
): ChatMessage[] {
  if (!reasoning?.enabled) return messages;

  const directive = hermesReasoningSystemDirective(model);
  if (!directive) return messages;

  const systemIdx = messages.findIndex((m) => m.role === "system");
  if (systemIdx >= 0) {
    const existing = messages[systemIdx];
    const content =
      typeof existing.content === "string" ? existing.content.trim() : "";
    return messages.map((m, i) =>
      i === systemIdx
        ? {
            ...m,
            content: content ? `${content}\n\n${directive}` : directive,
          }
        : m,
    );
  }

  return [{ role: "system", content: directive }, ...messages];
}

function createOpenRouterClient(apiKey: string) {
  return createAiClient({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME,
    },
  });
}

function createOllamaClient(baseUrl: string) {
  return createAiClient({
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

  const resolvedModel =
    provider === "ollama"
      ? model?.trim() || DEFAULT_OLLAMA_MODEL
      : model?.trim() || DEFAULT_MODEL;

  const upstreamMessages = withReasoningSystemPrompt(
    fullMessages,
    resolvedModel,
    reasoning,
  );

  const streamReasoning = shouldStreamReasoning(reasoning);
  const showReasoningInStream = Boolean(reasoning?.showInResponse);
  let upstream: AsyncGenerator<import("@/lib/ai-client").ChatCompletionChunk>;

  if (provider === "ollama") {
    const baseUrl = normalizeOllamaBaseUrl(
      ollamaBaseUrl?.trim() || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
    );

    if (!resolvedModel) {
      return new Response(
        "No Ollama model selected. Choose one in Model providers settings.",
        { status: 400 },
      );
    }

    const client = createOllamaClient(baseUrl);

    try {
      upstream = client.stream({
        model: resolvedModel,
        messages: upstreamMessages,
        ...(reasoning?.enabled ? { think: true } : {}),
      });
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
    const reasoningParam = buildOpenRouterReasoning(reasoning, resolvedModel);

    try {
      upstream = client.stream({
        model: resolvedModel,
        messages: upstreamMessages,
        ...(reasoningParam ? { reasoning: reasoningParam } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upstream error.";
      return new Response(`OpenRouter error: ${message}`, { status: 502 });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const tagSplitter = streamReasoning ? createThinkingTagSplitter() : null;
      const plainSplitter = streamReasoning ? createPlainReasoningSplitter() : null;
      let sawDedicatedReasoning = false;

      try {
        for await (const chunk of upstream) {
          const delta = chunk.choices[0]?.delta;
          let reasoningText = extractDeltaReasoning(delta);
          let contentText = delta?.content ?? "";

          if (hasDedicatedReasoning(delta)) sawDedicatedReasoning = true;

          if (tagSplitter && contentText) {
            const split = tagSplitter.push(contentText);
            if (split.reasoning) reasoningText += split.reasoning;
            contentText = split.content;
          }

          if (plainSplitter && contentText && !sawDedicatedReasoning) {
            const split = plainSplitter.push(contentText);
            if (split.reasoning) reasoningText += split.reasoning;
            contentText = split.content;
          }

          if (streamReasoning) {
            if (reasoningText && showReasoningInStream) {
              controller.enqueue(encodePart("reasoning", reasoningText));
            }
            if (contentText) controller.enqueue(encodePart("content", contentText));
          } else if (contentText) {
            controller.enqueue(textEncoder.encode(contentText));
          }
        }

        if (tagSplitter) {
          const tail = tagSplitter.flush();
          let tailReasoning = tail.reasoning;
          let tailContent = tail.content;

          if (plainSplitter && tailContent && !sawDedicatedReasoning) {
            const split = plainSplitter.push(tailContent);
            if (split.reasoning) tailReasoning += split.reasoning;
            tailContent = split.content;
          }

          if (plainSplitter && !sawDedicatedReasoning) {
            const plainTail = plainSplitter.flush();
            if (plainTail.reasoning) tailReasoning += plainTail.reasoning;
            if (plainTail.content) tailContent += plainTail.content;
          } else if (!tailReasoning && tailContent) {
            const split = reconcileReasoningAndContent("", tailContent);
            tailReasoning = split.reasoning;
            tailContent = split.content;
          } else if (tailReasoning && !tailContent) {
            const split = reconcileReasoningAndContent(tailReasoning, "");
            tailReasoning = split.reasoning;
            tailContent = split.content;
          }

          if (tailReasoning && showReasoningInStream) {
            controller.enqueue(encodePart("reasoning", tailReasoning));
          }
          if (tailContent) controller.enqueue(encodePart("content", tailContent));
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
