export type ModelCapabilities = {
  vision: boolean;
  code: boolean;
  pdf: boolean;
  tools: boolean;
  contextTokens: number | null;
};

export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  vision: false,
  code: true,
  pdf: true,
  tools: true,
  contextTokens: null,
};

export function attachmentSupported(
  kind: "image" | "pdf" | "code",
  capabilities: ModelCapabilities,
): boolean {
  if (kind === "image") return capabilities.vision;
  return true;
}

export function unsupportedReason(
  kind: "image" | "pdf" | "code" | "tools",
  model: string,
): string {
  if (kind === "image") {
    return `Images aren't supported by ${model || "this model"}. Choose a vision-capable model.`;
  }
  if (kind === "tools") {
    return `${model || "This model"} can't use the save_memory tool. Memories are still injected into the prompt — add them manually in settings.`;
  }
  return `This file type isn't supported by ${model || "this model"}.`;
}

type OpenRouterModel = {
  id: string;
  context_length?: number | null;
  architecture?: {
    input_modalities?: string[];
  };
  top_provider?: {
    context_length?: number | null;
  };
};

function contextLengthFromOpenRouterModel(
  model: OpenRouterModel | null | undefined,
): number | null {
  if (!model) return null;
  const fromProvider = model.top_provider?.context_length;
  if (typeof fromProvider === "number" && fromProvider > 0) return fromProvider;
  const topLevel = model.context_length;
  if (typeof topLevel === "number" && topLevel > 0) return topLevel;
  return null;
}

export function capabilitiesFromOpenRouterModel(
  model: OpenRouterModel | null | undefined,
): ModelCapabilities {
  const modalities = model?.architecture?.input_modalities ?? [];
  return {
    vision: modalities.includes("image"),
    code: true,
    pdf: true,
    tools: true,
    contextTokens: contextLengthFromOpenRouterModel(model),
  };
}

export type OllamaShowResponse = {
  capabilities?: string[];
  parameters?: string;
  model_info?: Record<string, number | string>;
  details?: {
    families?: string[];
  };
};

function nativeContextLengthFromOllamaModelInfo(
  modelInfo: Record<string, number | string> | undefined,
): number | null {
  if (!modelInfo) return null;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith(".context_length") && typeof value === "number" && value > 0) {
      return value;
    }
  }
  return null;
}

function numCtxFromOllamaParameters(parameters: string | undefined): number | null {
  if (!parameters) return null;
  for (const line of parameters.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("num_ctx ")) continue;
    const value = Number.parseInt(trimmed.slice("num_ctx ".length).trim(), 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function contextLengthFromOllamaShow(
  data: OllamaShowResponse | null | undefined,
): number | null {
  if (!data) return null;
  const native = nativeContextLengthFromOllamaModelInfo(data.model_info);
  const numCtx = numCtxFromOllamaParameters(data.parameters);
  if (native != null && numCtx != null) return Math.min(native, numCtx);
  return native ?? numCtx;
}

export function capabilitiesFromOllamaShow(
  data: OllamaShowResponse | null | undefined,
): ModelCapabilities {
  const capabilities = data?.capabilities ?? [];
  const families = data?.details?.families ?? [];
  const vision = capabilities.includes("vision") || families.includes("clip");
  const tools = capabilities.includes("tools");

  return {
    vision,
    code: true,
    pdf: true,
    tools,
    contextTokens: contextLengthFromOllamaShow(data),
  };
}
