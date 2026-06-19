import type { ModelProvider, UserSettings } from "./types";

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openrouter: "OpenRouter",
  ollama: "Ollama",
};

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

export function normalizeOllamaBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "") || DEFAULT_OLLAMA_BASE_URL;
}

export function getActiveModel(settings: UserSettings): string {
  return settings.provider === "ollama"
    ? settings.ollamaModel.trim()
    : settings.model.trim();
}

export function getOpenRouterApiKey(settings: UserSettings): string {
  return settings.openRouterApiKey.trim();
}

export function getOllamaBaseUrl(settings: UserSettings): string {
  return normalizeOllamaBaseUrl(settings.ollamaBaseUrl);
}

export type OllamaModel = {
  name: string;
  size?: number;
  modifiedAt?: string;
};

export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(
    `/api/ollama/models?baseUrl=${encodeURIComponent(normalizeOllamaBaseUrl(baseUrl))}`,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Failed to load models (${res.status})`);
  }
  const data = (await res.json()) as { models: OllamaModel[] };
  return data.models;
}
