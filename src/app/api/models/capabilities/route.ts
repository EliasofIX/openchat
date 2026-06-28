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

type CapabilitiesInput = {
  provider?: string;
  model?: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
};

function parseInput(input: CapabilitiesInput) {
  const provider: ModelProvider = input.provider === "ollama" ? "ollama" : "openrouter";
  const model = input.model?.trim() ?? "";
  const apiKey = input.apiKey?.trim();
  const ollamaBaseUrl = input.ollamaBaseUrl?.trim();
  return { provider, model, apiKey, ollamaBaseUrl };
}

async function loadCapabilities(input: CapabilitiesInput) {
  const { provider, model, apiKey, ollamaBaseUrl } = parseInput(input);

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return loadCapabilities({
    provider: searchParams.get("provider") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    ollamaBaseUrl: searchParams.get("ollamaBaseUrl") ?? undefined,
  });
}

export async function POST(req: Request) {
  let body: CapabilitiesInput;
  try {
    body = (await req.json()) as CapabilitiesInput;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }
  return loadCapabilities(body);
}
