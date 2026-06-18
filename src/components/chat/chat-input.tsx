"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
};

export function ChatInput({ value, onChange, onSubmit, onStop, isStreaming, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a max height. Cheap and avoids a dependency.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 200);
    el.style.height = `${next}px`;
  }, [value]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isStreaming && value.trim()) onSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !isStreaming && !disabled;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className={cn(
        "relative flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2.5",
        "shadow-sm transition focus-within:border-foreground/30 focus-within:shadow-md",
      )}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder="Message…"
        rows={1}
        disabled={disabled}
        className={cn(
          "flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[0.95rem] leading-6 outline-none",
          "placeholder:text-muted-foreground",
        )}
      />
      {isStreaming ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full transition",
            canSend
              ? "bg-foreground text-background hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          <ArrowUp size={16} />
        </button>
      )}
    </form>
  );
}
