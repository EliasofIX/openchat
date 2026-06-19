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

export function buildOpenRouterReasoning(
  settings?: ReasoningSettings,
): OpenRouterReasoning | undefined {
  if (!settings?.enabled) return undefined;

  const reasoning: OpenRouterReasoning = {
    exclude: !settings.showInResponse,
  };

  if (settings.effort === "none") {
    reasoning.effort = "none";
  } else {
    reasoning.effort = settings.effort;
  }

  return reasoning;
}

export function shouldStreamReasoning(settings?: ReasoningSettings): boolean {
  return Boolean(settings?.enabled && settings.showInResponse);
}
