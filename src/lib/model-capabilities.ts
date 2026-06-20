// Heuristic model capability detection from model id strings.
// OpenRouter/Ollama don't expose a unified capability API client-side, so we
// pattern-match common vision-capable model families.

export type ModelCapabilities = {
  vision: boolean;
  code: boolean;
  pdf: boolean;
};

const VISION_PATTERNS = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-5/i,
  /\bo[134](?:-mini)?\b/i,
  /claude-3/i,
  /claude-4/i,
  /claude-opus/i,
  /claude-sonnet/i,
  /claude-haiku/i,
  /gemini/i,
  /gemma.*vision/i,
  /llava/i,
  /bakllava/i,
  /moondream/i,
  /llama.*vision/i,
  /llama3\.2/i,
  /llama-3\.2/i,
  /pixtral/i,
  /mistral-large/i,
  /qwen.*vl/i,
  /internvl/i,
  /grok-4/i,
  /grok.*vision/i,
  /phi-3.*vision/i,
  /phi-4/i,
  /minicpm-v/i,
  /cogvlm/i,
  /deepseek-vl/i,
  /aria/i,
  /vision/i,
];

export function getModelCapabilities(model: string): ModelCapabilities {
  const id = model.trim();
  const vision = id.length > 0 && VISION_PATTERNS.some((p) => p.test(id));

  return {
    vision,
    // Code and PDF (as extracted text) work with any text model.
    code: true,
    pdf: true,
  };
}

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
