export type ModelCapabilities = {
  vision: boolean;
  code: boolean;
  pdf: boolean;
};

export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  vision: false,
  code: true,
  pdf: true,
};

export function attachmentSupported(
  kind: "image" | "pdf" | "code",
  capabilities: ModelCapabilities,
): boolean {
  if (kind === "image") return capabilities.vision;
  return true;
}

export function unsupportedReason(
  kind: "image" | "pdf" | "code",
  model: string,
): string {
  if (kind === "image") {
    return `Images aren't supported by ${model || "this model"}. Choose a vision-capable model.`;
  }
  return `This file type isn't supported by ${model || "this model"}.`;
}

type OpenRouterModel = {
  id: string;
  architecture?: {
    input_modalities?: string[];
  };
};

export function capabilitiesFromOpenRouterModel(
  model: OpenRouterModel | null | undefined,
): ModelCapabilities {
  const modalities = model?.architecture?.input_modalities ?? [];
  return {
    vision: modalities.includes("image"),
    code: true,
    pdf: true,
  };
}

type OllamaShowResponse = {
  capabilities?: string[];
  details?: {
    families?: string[];
  };
};

export function capabilitiesFromOllamaShow(
  data: OllamaShowResponse | null | undefined,
): ModelCapabilities {
  const capabilities = data?.capabilities ?? [];
  const families = data?.details?.families ?? [];
  const vision = capabilities.includes("vision") || families.includes("clip");

  return {
    vision,
    code: true,
    pdf: true,
  };
}
