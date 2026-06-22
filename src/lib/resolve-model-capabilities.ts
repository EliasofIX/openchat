import {
  capabilitiesFromOllamaShow,
  capabilitiesFromOpenRouterModel,
  DEFAULT_CAPABILITIES,
  type ModelCapabilities,
} from "@/lib/model-capabilities";
import { DEFAULT_OLLAMA_BASE_URL, normalizeOllamaBaseUrl } from "@/lib/providers";
import type { ModelProvider } from "@/lib/types";

type OpenRouterModelsResponse = {
  data?: Array<{
    id: string;
    context_length?: number | null;
    architecture?: {
      input_modalities?: string[];
    };
    top_provider?: {
      context_length?: number | null;
    };
  }>;
};

export async function resolveOpenRouterCapabilities(
  model: string,
  apiKey: string,
): Promise<ModelCapabilities> {
  const id = model.trim();
  if (!id) return DEFAULT_CAPABILITIES;

  const res = await fetch(
    `https://openrouter.ai/api/v1/models?q=${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `OpenRouter returned ${res.status}.`);
  }

  const body = (await res.json()) as OpenRouterModelsResponse;
  const match =
    body.data?.find((entry) => entry.id === id) ??
    body.data?.find((entry) => entry.id.endsWith(`/${id.split("/").pop()}`)) ??
    null;

  return capabilitiesFromOpenRouterModel(match);
}

export async function resolveOllamaCapabilities(
  model: string,
  baseUrlInput?: string,
): Promise<ModelCapabilities> {
  const id = model.trim();
  if (!id) return DEFAULT_CAPABILITIES;

  const baseUrl = normalizeOllamaBaseUrl(
    baseUrlInput?.trim() || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
  );

  const res = await fetch(`${baseUrl}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: id }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Ollama returned ${res.status}.`);
  }

  const body = (await res.json()) as import("@/lib/model-capabilities").OllamaShowResponse;
  return capabilitiesFromOllamaShow(body);
}

export async function resolveModelCapabilities(input: {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
}): Promise<ModelCapabilities> {
  const { provider, model, apiKey, ollamaBaseUrl } = input;

  if (provider === "ollama") {
    return resolveOllamaCapabilities(model, ollamaBaseUrl);
  }

  const key = apiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "No OpenRouter API key. Add one in Model providers or set OPENROUTER_API_KEY.",
    );
  }

  return resolveOpenRouterCapabilities(model, key);
}
