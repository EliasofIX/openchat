"use client";

import { memo, useEffect, useState } from "react";
import { Check, ChevronDown, Copy } from "@/components/icons";
import { Markdown } from "@/components/markdown-lazy";
import { formatDuration } from "@/lib/reasoning";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  isThinking: boolean;
  durationMs?: number;
  defaultOpen: boolean;
};

function ReasoningPanelInner({ content, isThinking, durationMs, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (isThinking) {
      setOpen(true);
      return;
    }
    if (!userToggled) setOpen(defaultOpen);
  }, [isThinking, defaultOpen, userToggled]);

  const onToggle = () => {
    setUserToggled(true);
    setOpen((v) => !v);
  };

  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  const durationLabel =
    !isThinking && durationMs !== undefined && durationMs > 0
      ? formatDuration(durationMs)
      : null;

  const label = isThinking
    ? "Thinking…"
    : durationLabel
      ? `Thought for ${durationLabel}`
      : "Reasoning";

  return (
    <div className="group mb-2">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 opacity-50 transition-transform duration-150",
              open && "rotate-180",
            )}
          />
          <span>{label}</span>
        </button>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy reasoning"
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity",
            "hover:bg-muted hover:text-foreground group-hover:opacity-100",
          )}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>

      {open && (
        <div className="max-h-[min(40vh,320px)] overflow-y-auto border-l border-border/40 py-1 pl-3 text-[0.8125rem] leading-relaxed text-muted-foreground/80">
          {isThinking ? (
            <div className="whitespace-pre-wrap break-words">
              {content}
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3 w-0.5 animate-pulse rounded-sm bg-muted-foreground/40 align-middle"
              />
            </div>
          ) : (
            <Markdown content={content} />
          )}
        </div>
      )}
    </div>
  );
}

export const ReasoningPanel = memo(ReasoningPanelInner, (prev, next) => {
  return (
    prev.content === next.content &&
    prev.isThinking === next.isThinking &&
    prev.durationMs === next.durationMs &&
    prev.defaultOpen === next.defaultOpen
  );
});
