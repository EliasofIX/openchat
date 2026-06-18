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

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "openai/gpt-4o-mini";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Open AI Chat UI";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  systemPrompt?: string;
};

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      "OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and add your key.",
      { status: 500 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const { messages, model, systemPrompt } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("`messages` must be a non-empty array.", { status: 400 });
  }

  // OpenRouter exposes an OpenAI-compatible API, so we can use the `openai`
  // SDK by pointing `baseURL` at it. To switch providers, change baseURL +
  // headers + apiKey here.
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      // OpenRouter uses these for traffic attribution / leaderboards.
      // Both are optional but recommended.
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME,
    },
  });

  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  let upstream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    upstream = await client.chat.completions.create({
      model: model ?? DEFAULT_MODEL,
      messages: fullMessages,
      stream: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upstream error.";
    return new Response(`Upstream error: ${message}`, { status: 502 });
  }

  // We stream raw UTF-8 text — no SSE framing, no JSON envelopes — so the
  // client just reads tokens and appends. Simple and transparent.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of upstream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      // Client aborted (user clicked Stop). The SDK will tear down the upstream
      // request when this generator is no longer being read.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
