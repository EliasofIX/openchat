import { GROK_TTS_MODEL, isGrokTtsVoice } from "@/lib/tts";
import type { GrokTtsVoice } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Open AI Chat UI";

type TtsRequest = {
  text?: string;
  voice?: GrokTtsVoice;
  apiKey?: string;
};

export async function POST(req: Request) {
  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return new Response("`text` must be a non-empty string.", { status: 400 });
  }

  const voice = body.voice ?? "eve";
  if (!isGrokTtsVoice(voice)) {
    return new Response(`Unsupported voice "${voice}".`, { status: 400 });
  }

  const apiKey = body.apiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      "No OpenRouter API key. Add one in Model providers or set OPENROUTER_API_KEY in .env.local.",
      { status: 500 },
    );
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME,
    },
    body: JSON.stringify({
      model: GROK_TTS_MODEL,
      input: text,
      voice,
      response_format: "mp3",
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
    return new Response(detail || `TTS request failed (${upstream.status}).`, { status });
  }

  const audio = await upstream.arrayBuffer();
  return new Response(audio, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
