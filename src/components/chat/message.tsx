"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

export function MessageItem({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground whitespace-pre-wrap break-words text-[0.95rem] leading-7">
          {message.content}
        </div>
      </div>
    );
  }

  return <AssistantMessage message={message} />;
}

function AssistantMessage({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="group">
      <Markdown content={message.content} />
      {message.content && (
        <div className="mt-1.5 -ml-1 flex h-6 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onCopy}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground",
              "transition hover:bg-muted hover:text-foreground",
            )}
            aria-label="Copy reply"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function StreamingCursor() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-4 w-1.5 translate-y-[2px] animate-pulse rounded-sm bg-foreground/70 align-middle"
    />
  );
}
