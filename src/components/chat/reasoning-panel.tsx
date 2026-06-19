"use client";

import { useEffect, useState } from "react";
import { Brain, Check, ChevronDown, Copy } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { formatDuration } from "@/lib/reasoning";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  isThinking: boolean;
  durationMs?: number;
  defaultOpen: boolean;
};

export function ReasoningPanel({ content, isThinking, durationMs, defaultOpen }: Props) {
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

  const label = isThinking ? "Thinking…" : "Reasoning";
  const durationLabel =
    !isThinking && durationMs !== undefined && durationMs > 0
      ? formatDuration(durationMs)
      : null;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border/70 bg-muted/30 border-l-[3px] border-l-violet-500/40">
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
        >
          <Brain
            size={14}
            className={cn("shrink-0 text-violet-500", isThinking && "animate-pulse")}
          />
          <span className={cn(isThinking && "animate-pulse")}>{label}</span>
          {durationLabel && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              Thought for {durationLabel}
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn(
              "ml-auto shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy reasoning"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="max-h-[min(40vh,320px)] overflow-y-auto border-t border-border/60 px-3.5 py-3 text-[0.84rem] leading-6 text-muted-foreground">
            <Markdown content={content} />
            {isThinking && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3.5 w-1 translate-y-[1px] animate-pulse rounded-sm bg-muted-foreground/60 align-middle"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
