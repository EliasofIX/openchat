// ─────────────────────────────────────────────────────────────────────────────
//  Chat API — server-side gateway between the browser and the AI provider.
//
//  This is the *only* place in the app that talks to an LLM. Everything below
//  is plain Node.js: receive messages, call the provider, stream tokens back.
//
//  To swap providers (OpenAI direct, Anthropic, Groq, a local server, …),
//  edit *this file* and nothing else. The client just consumes a text stream
//  and doesn't care what produced it.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import {
  buildOpenRouterReasoning,
  shouldStreamReasoning,
} from "@/lib/openrouter";
import { extractReasoningText } from "@/lib/reasoning";
import type { ReasoningSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "openai/gpt-4o-mini";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Open AI Chat UI";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning?: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  systemPrompt?: string;
  apiKey?: string;
  reasoning?: ReasoningSettings;
};

type StreamPart = "content" | "reasoning";

function encodePart(part: StreamPart, text: string): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({ p: part, t: text })}\n`);
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const { messages, model, systemPrompt, apiKey, reasoning } = body;
  const resolvedKey = apiKey?.trim() || process.env.OPENROUTER_API_KEY;

  if (!resolvedKey) {
    return new Response(
      "No OpenRouter API key. Add one in Settings or set OPENROUTER_API_KEY in .env.local.",
      { status: 500 },
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("`messages` must be a non-empty array.", { status: 400 });
  }

  const client = new OpenAI({
    apiKey: resolvedKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME,
    },
  });

  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const reasoningParam = buildOpenRouterReasoning(reasoning);
  const streamReasoning = shouldStreamReasoning(reasoning);

  let upstream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    upstream = await client.chat.completions.create({
      model: model?.trim() || DEFAULT_MODEL,
      messages: fullMessages,
      stream: true,
      ...(reasoningParam ? { reasoning: reasoningParam } : {}),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upstream error.";
    return new Response(`Upstream error: ${message}`, { status: 502 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of upstream) {
          const delta = chunk.choices[0]?.delta as
            | (OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
                reasoning?: string;
                reasoning_content?: string;
                reasoning_details?: Array<{
                  type?: string;
                  text?: string;
                  summary?: string;
                }>;
              })
            | undefined;

          const reasoningText = extractReasoningText(delta);
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
