"use client";

import { HardDrive } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { MemoryNotice } from "@/lib/types";

const LABELS: Record<MemoryNotice["status"], string> = {
  saved: "Remembered",
  duplicate: "Already remembered",
  full: "Memory full",
  storage_failed: "Couldn't save",
  tool_round_limit: "Save limit reached",
};

function factText(notice: MemoryNotice): string | null {
  if (notice.status === "full") {
    return "Couldn't save — free space in settings";
  }
  if (notice.status === "storage_failed") {
    return notice.content?.trim() || "Browser storage is full";
  }
  if (notice.status === "tool_round_limit") {
    return "Too many save attempts in one reply — add manually in settings";
  }
  const text = notice.content?.trim();
  return text || null;
}

type Props = {
  notice: MemoryNotice;
  onOpenMemorySettings?: () => void;
};

export function MemoryNoticeRow({ notice, onOpenMemorySettings }: Props) {
  const fact = factText(notice);
  const isError =
    notice.status === "full" ||
    notice.status === "storage_failed" ||
    notice.status === "tool_round_limit";

  return (
    <div
      className={cn(
        "mt-2.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
        isError && "text-destructive/80",
      )}
    >
      <HardDrive size={12} className="shrink-0 opacity-55" />
      <span className="shrink-0">{LABELS[notice.status]}</span>
      {fact && (
        <>
          <span className="opacity-45">·</span>
          <span className="min-w-0 truncate">{fact}</span>
        </>
      )}
      {onOpenMemorySettings && (
        <button
          type="button"
          onClick={onOpenMemorySettings}
          className={cn(
            "ml-1 shrink-0 transition-opacity coarse:opacity-100",
            "hover:text-foreground hover:underline hover:underline-offset-2",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          Memory
        </button>
      )}
    </div>
  );
}
