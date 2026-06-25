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

  if (settings.effort === "none") {
    return { enabled: false, effort: "none" };
  }

  return {
    enabled: true,
    effort: settings.effort,
    exclude: !settings.showInResponse,
  };
}

export function shouldStreamReasoning(settings?: ReasoningSettings): boolean {
  return Boolean(settings?.enabled);
}
