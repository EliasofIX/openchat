"use client";

import { useState } from "react";
import { Check, Copy, FileCode2, FileText } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { ReasoningPanel } from "./reasoning-panel";
import { cn } from "@/lib/utils";
import type { Message, MessageAttachment } from "@/lib/types";

export function MessageItem({
  message,
  isStreaming = false,
  collapseReasoningByDefault = true,
}: {
  message: Message;
  isStreaming?: boolean;
  collapseReasoningByDefault?: boolean;
}) {
  if (message.role === "user") {
    const hasAttachments = Boolean(message.attachments?.length);
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] space-y-2">
          {hasAttachments && (
            <div className="flex flex-wrap justify-end gap-2">
              {message.attachments!.map((att) => (
                <UserAttachment key={att.id} attachment={att} />
              ))}
            </div>
          )}
          {message.content && (
            <div className="rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground whitespace-pre-wrap break-words text-[0.95rem] leading-7">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AssistantMessage
      message={message}
      isStreaming={isStreaming}
      collapseReasoningByDefault={collapseReasoningByDefault}
    />
  );
}

function AssistantMessage({
  message,
  isStreaming,
  collapseReasoningByDefault,
}: {
  message: Message;
  isStreaming: boolean;
  collapseReasoningByDefault: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const hasReasoning = Boolean(message.reasoning?.trim());
  const hasContent = Boolean(message.content);
  const isThinking = isStreaming && hasReasoning && !hasContent;

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
      {hasReasoning && (
        <ReasoningPanel
          content={message.reasoning ?? ""}
          isThinking={isThinking}
          durationMs={message.reasoningDurationMs}
          defaultOpen={!collapseReasoningByDefault}
        />
      )}

      {hasContent && <Markdown content={message.content} />}

      {!hasContent && !hasReasoning && isStreaming && <StreamingCursor />}

      {hasContent && (
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

function UserAttachment({ attachment: att }: { attachment: MessageAttachment }) {
  if (att.kind === "image" && att.dataUrl) {
    return (
      <div className="overflow-hidden rounded-xl border border-primary-foreground/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.dataUrl}
          alt={att.name}
          className="max-h-48 max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary-foreground/20 bg-primary/80 px-3 py-2 text-primary-foreground">
      {att.kind === "pdf" ? <FileText size={14} /> : <FileCode2 size={14} />}
      <span className="max-w-[12rem] truncate text-xs">{att.name}</span>
    </div>
  );
}
