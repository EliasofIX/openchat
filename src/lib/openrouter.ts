import type { ReasoningSettings } from "./types";

export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export const REASONING_EFFORT_LABELS: Record<
  (typeof REASONING_EFFORTS)[number],
  string
> = {
  none: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Max",
};

export type OpenRouterReasoning = {
  effort?: string;
  exclude?: boolean;
  enabled?: boolean;
};

export function isHermesReasoningModel(model?: string): boolean {
  return /hermes[-/]?4/i.test(model ?? "");
}

export function buildOpenRouterReasoning(
  settings?: ReasoningSettings,
  model?: string,
): OpenRouterReasoning | undefined {
  if (!settings?.enabled) return undefined;

  if (settings.effort === "none") {
    return { enabled: false, effort: "none" };
  }

  const reasoning: OpenRouterReasoning = {
    enabled: true,
    exclude: !settings.showInResponse,
  };

  // Nebius-hosted Hermes 4 only documents reasoning.enabled — effort is ignored.
  if (!isHermesReasoningModel(model)) {
    reasoning.effort = settings.effort;
  }

  return reasoning;
}

// Nous Hermes 4 reasoning-mode system prompt (HF model card). Required on Nebius
// when reasoning.enabled alone still streams untagged monologue in delta.content.
export function hermesReasoningSystemDirective(model?: string): string | undefined {
  if (!isHermesReasoningModel(model)) return undefined;
  return [
    "You are a deep thinking AI.",
    "Use long chains of thought to consider the problem before answering.",
    "Enclose your thoughts and internal monologue inside",
    "<think>...</think> or \x3cthink\x3e...\x3c/think\x3e tags,",
    "then provide your solution or response outside those tags.",
  ].join(" ");
}

export function shouldIncludeReasoningInRequest(
  settings?: ReasoningSettings,
): boolean {
  return Boolean(settings?.enabled && settings.showInResponse);
}

export function shouldStreamReasoning(settings?: ReasoningSettings): boolean {
  return Boolean(settings?.enabled);
}
