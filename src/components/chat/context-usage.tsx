"use client";

import { formatTokenCount } from "@/lib/estimate-context";
import type { ContextUsageState } from "@/hooks/use-context-usage";
import { cn, glassPill } from "@/lib/utils";

type Props = {
  usage: ContextUsageState;
  loading?: boolean;
};

function barColor(percent: number | null): string {
  if (percent == null) return "bg-muted-foreground/40";
  if (percent >= 90) return "bg-destructive";
  if (percent >= 70) return "bg-amber-500";
  return "bg-muted-foreground/50";
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
      className={glassPill(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium text-muted-foreground",
      )}
      title={tooltip}
      aria-label={ariaLabel}
    >
      <span className="whitespace-nowrap tabular-nums">{label}</span>
      {hasLimit && !loading && (
        <span
          className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]"
          aria-hidden
        >
          <span
            className={cn("block h-full rounded-full transition-[width]", barColor(percent))}
            style={{ width: `${percent ?? 0}%` }}
          />
        </span>
      )}
    </span>
  );
}
