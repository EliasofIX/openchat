"use client";

import { formatTokenCount } from "@/lib/estimate-context";
import type { ContextUsageState } from "@/hooks/use-context-usage";
import { cn } from "@/lib/utils";

type Props = {
  usage: ContextUsageState;
  loading?: boolean;
};

function barColor(percent: number | null): string {
  if (percent == null) return "bg-muted-foreground";
  if (percent >= 90) return "bg-destructive";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function buildTooltip(usage: ContextUsageState): string {
  const { breakdown } = usage;
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
  lines.push("", "Token count is approximate.");
  return lines.join("\n");
}

export function ContextUsage({ usage, loading = false }: Props) {
  const { used, limit, hasLimit, percent } = usage;
  const tooltip = buildTooltip(usage);

  const label = loading
    ? "… / …"
    : hasLimit
      ? `${formatTokenCount(used)} / ${formatTokenCount(limit!)}`
      : `${formatTokenCount(used)} used`;

  const ariaLabel = hasLimit
    ? `Context usage: ${formatTokenCount(used)} of ${formatTokenCount(limit!)} tokens estimated`
    : `Context usage: ${formatTokenCount(used)} tokens estimated`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1",
        "text-[10px] font-medium text-foreground shadow-sm",
      )}
      title={tooltip}
      aria-label={ariaLabel}
    >
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">{label}</span>
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
