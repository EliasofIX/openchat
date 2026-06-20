import { completeChat } from "@/lib/ai-completion";
import { TITLE_SYSTEM_PROMPT } from "@/lib/title-prompt";
import type { ModelProvider } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type TitleRequest = {
  messages: string;
  provider?: ModelProvider;
  model?: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
};

function resolveProvider(value?: string): ModelProvider {
  return value === "ollama" ? "ollama" : "openrouter";
}

function sanitizeTitle(raw: string): string {
  let title = raw.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/[.!?]+$/, "");
  title = title.replace(/\s+/g, " ").trim();
  if (title.length > 80) title = `${title.slice(0, 77)}…`;
  return title || "New chat";
}

export async function POST(req: Request) {
  let body: TitleRequest;
  try {
    body = (await req.json()) as TitleRequest;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const { messages, model, apiKey, ollamaBaseUrl, provider: providerInput } = body;
  const provider = resolveProvider(providerInput);

  if (!messages?.trim()) {
    return new Response("`messages` must be a non-empty string.", { status: 400 });
  }

  try {
    const raw = await completeChat({
      provider,
      model,
      apiKey,
      ollamaBaseUrl,
      useTitleDefault: true,
      messages: [
        { role: "system", content: TITLE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Generate a title for this conversation:\n\n${messages.trim()}`,
        },
      ],
    });

    return Response.json({ title: sanitizeTitle(raw) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upstream error.";
    const status = message.includes("API key") || message.includes("model") ? 400 : 502;
    return new Response(message, { status });
  }
}
