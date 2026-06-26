import {
  resolveModelCapabilities,
} from "@/lib/resolve-model-capabilities";
import type { ModelCapabilities } from "@/lib/model-capabilities";
import type { ModelProvider } from "@/lib/types";

export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_CONTROL = "private, max-age=3600";
const cache = new Map<string, { expires: number; capabilities: ModelCapabilities }>();

function jsonCapabilities(capabilities: ModelCapabilities) {
  return Response.json(capabilities, {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}

function cacheKey(
  provider: ModelProvider,
  model: string,
  ollamaBaseUrl?: string,
): string {
  return `${provider}:${model.trim().toLowerCase()}:${ollamaBaseUrl?.trim() ?? ""}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") === "ollama" ? "ollama" : "openrouter";
  const model = searchParams.get("model")?.trim() ?? "";
  const apiKey = searchParams.get("apiKey")?.trim();
  const ollamaBaseUrl = searchParams.get("ollamaBaseUrl")?.trim();

  if (!model) {
    return new Response("`model` is required.", { status: 400 });
  }

  const key = cacheKey(provider, model, ollamaBaseUrl);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return jsonCapabilities(cached.capabilities);
  }

  try {
    const capabilities = await resolveModelCapabilities({
      provider,
      model,
      apiKey,
      ollamaBaseUrl,
    });
    cache.set(key, { capabilities, expires: Date.now() + CACHE_TTL_MS });
    return jsonCapabilities(capabilities);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load model capabilities.";
    return new Response(message, { status: 502 });
  }
}
