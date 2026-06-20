"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CAPABILITIES,
  type ModelCapabilities,
} from "@/lib/model-capabilities";
import type { ModelProvider } from "@/lib/types";

type Options = {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
};

const clientCache = new Map<string, ModelCapabilities>();

function cacheKey(options: Options): string {
  return `${options.provider}:${options.model.trim().toLowerCase()}:${options.ollamaBaseUrl?.trim() ?? ""}`;
}

export function useModelCapabilities(options: Options) {
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(DEFAULT_CAPABILITIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const model = options.model.trim();
    if (!model) {
      setCapabilities(DEFAULT_CAPABILITIES);
      setLoading(false);
      setError(null);
      return;
    }

    const key = cacheKey(options);
    const cached = clientCache.get(key);
    if (cached) {
      setCapabilities(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      provider: options.provider,
      model,
    });
    if (options.apiKey?.trim()) params.set("apiKey", options.apiKey.trim());
    if (options.ollamaBaseUrl?.trim()) params.set("ollamaBaseUrl", options.ollamaBaseUrl.trim());

    void fetch(`/api/models/capabilities?${params}`)
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Request failed (${res.status})`);
        }
        return res.json() as Promise<ModelCapabilities>;
      })
      .then((next) => {
        if (requestId.current !== id) return;
        clientCache.set(key, next);
        setCapabilities(next);
        setError(null);
      })
      .catch((err: Error) => {
        if (requestId.current !== id) return;
        setCapabilities(DEFAULT_CAPABILITIES);
        setError(err.message);
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [options.provider, options.model, options.apiKey, options.ollamaBaseUrl]);

  return { capabilities, loading, error };
}
