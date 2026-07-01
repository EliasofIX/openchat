"use client";

import { formatTokenCount } from "@/lib/estimate-context";
import type { PromptCachingMode } from "@/lib/prompt-cache";
import type { ContextUsageState } from "@/hooks/use-context-usage";
import type { PromptCachingSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  usage: ContextUsageState;
  loading?: boolean;
  promptCaching?: PromptCachingSettings;
  promptCachingMode?: PromptCachingMode;
};

function promptCachingLabel(mode: PromptCachingMode): string | null {
  switch (mode) {
    case "auto":
      return "Auto prompt cache";
    case "explicit":
      return "Explicit prompt cache";
    case "implicit":
      return "Implicit prompt cache";
    default:
      return null;
  }
}

function buildTooltip(
  usage: ContextUsageState,
  promptCaching?: PromptCachingSettings,
  promptCachingMode?: PromptCachingMode,
): string {
  const { breakdown, lastCacheUsage } = usage;
  const lines = [
    `System: ~${formatTokenCount(breakdown.system)}`,
    `Messages: ~${formatTokenCount(breakdown.messages)}`,
  ];
  if (breakdown.draft > 0) {
    lines.push(`Draft: ~${formatTokenCount(breakdown.draft)}`);
  }
  if (breakdown.images > 0) {
    lines.push(`Images (estimated): ~${formatTokenCount(breakdown.images)}`);
  }
  lines.push("", "Context estimate uses a chars/4 heuristic.");

  if (promptCaching?.enabled && promptCachingMode && promptCachingMode !== "none") {
    lines.push(
      "",
      `Prompt caching: ${promptCachingLabel(promptCachingMode) ?? "enabled"} (${promptCaching.ttl === "1h" ? "1 hour" : "5 min"} TTL)`,
    );
  }

  if (lastCacheUsage && lastCacheUsage.promptTokens > 0) {
    lines.push(
      "",
      `Last response: ${formatTokenCount(lastCacheUsage.promptTokens)} prompt tokens`,
      `Cached read: ${formatTokenCount(lastCacheUsage.cachedTokens)}`,
      `Cache write: ${formatTokenCount(lastCacheUsage.cacheWriteTokens)}`,
    );
  }

  return lines.join("\n");
}

function barColor(percent: number | null): string {
  if (percent == null) return "bg-muted-foreground";
  if (percent >= 90) return "bg-destructive";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500 [html.has-color-accent_&]:bg-primary";
}

export function ContextUsage({
  usage,
  loading = false,
  promptCaching,
  promptCachingMode = "none",
}: Props) {
  const { used, limit, hasLimit, percent, lastCacheUsage } = usage;
  const tooltip = buildTooltip(usage, promptCaching, promptCachingMode);
  const cachingActive =
    Boolean(promptCaching?.enabled) &&
    promptCachingMode !== "none" &&
    promptCaching?.enabled;

  const label = loading
    ? "… / …"
    : hasLimit
      ? `${formatTokenCount(used)} / ${formatTokenCount(limit!)}`
      : `${formatTokenCount(used)} used`;

  const cacheSuffix =
    !loading && lastCacheUsage && lastCacheUsage.cachedTokens > 0
      ? ` · ${formatTokenCount(lastCacheUsage.cachedTokens)} cached`
      : "";

  const ariaLabel = hasLimit
    ? `Context usage: ${formatTokenCount(used)} of ${formatTokenCount(limit!)} tokens estimated${cacheSuffix}`
    : `Context usage: ${formatTokenCount(used)} tokens estimated${cacheSuffix}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1",
        "text-[10px] font-medium text-foreground shadow-sm",
        cachingActive && "border-emerald-500/25",
      )}
      title={tooltip}
      aria-label={ariaLabel}
    >
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        {label}
        {cacheSuffix}
      </span>
      {hasLimit && !loading && (
        <span
          className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-border"
          aria-hidden
        >
          <span
            className={cn("block h-full min-w-[2px] rounded-full transition-[width]", barColor(percent))}
            style={{ width: `${Math.max(percent ?? 0, 2)}%` }}
          />
        </span>
      )}
    </span>
  );
}
