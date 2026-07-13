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
  fallbackProvider?: ModelProvider;
  fallbackModel?: string;
  zdrOnly?: boolean;
};

type TitleAttempt = {
  provider: ModelProvider;
  model?: string;
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

function isValidTitle(title: string): boolean {
  return title.length > 0 && title !== "New chat";
}

async function requestTitle(
  messages: string,
  provider: ModelProvider,
  model: string | undefined,
  apiKey: string | undefined,
  ollamaBaseUrl: string | undefined,
  zdrOnly: boolean | undefined,
): Promise<string> {
  return completeChat({
    provider,
    model,
    apiKey,
    ollamaBaseUrl,
    useTitleDefault: true,
    zdrOnly,
    messages: [
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Generate a title for this conversation:\n\n${messages.trim()}`,
      },
    ],
  });
}

function buildAttempts(body: TitleRequest): TitleAttempt[] {
  const provider = resolveProvider(body.provider);
  const fallbackProvider = body.fallbackProvider
    ? resolveProvider(body.fallbackProvider)
    : undefined;
  const primaryModel = body.model?.trim();
  const fallbackModel = body.fallbackModel?.trim();

  const attempts: TitleAttempt[] = [{ provider, model: primaryModel || undefined }];

  if (fallbackModel && (fallbackProvider !== provider || fallbackModel !== primaryModel)) {
    attempts.push({ provider: fallbackProvider ?? provider, model: fallbackModel });
  }

  // Deduplicate identical attempts.
  return attempts.filter(
    (attempt, index) =>
      attempts.findIndex(
        (other) => other.provider === attempt.provider && other.model === attempt.model,
      ) === index,
  );
}

export async function POST(req: Request) {
  let body: TitleRequest;
  try {
    body = (await req.json()) as TitleRequest;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const { messages, apiKey, ollamaBaseUrl, zdrOnly } = body;

  if (!messages?.trim()) {
    return new Response("`messages` must be a non-empty string.", { status: 400 });
  }

  const attempts = buildAttempts(body);
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const raw = await requestTitle(
        messages,
        attempt.provider,
        attempt.model,
        apiKey,
        ollamaBaseUrl,
        zdrOnly,
      );
      const title = sanitizeTitle(raw);
      if (isValidTitle(title)) {
        return Response.json({ title });
      }
      errors.push(
        `Model ${attempt.model ?? "(default)"} on ${attempt.provider} returned an empty title.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upstream error.";
      errors.push(`${attempt.provider}/${attempt.model ?? "default"}: ${message}`);
    }
  }

  const message = errors.join(" | ") || "Title generation failed.";
  const status = message.includes("API key") || message.includes("model") ? 400 : 502;
  return new Response(message, { status });
}
