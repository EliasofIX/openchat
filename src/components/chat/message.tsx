"use client";

import { memo, useState } from "react";
import { Check, Copy, FileCode2, FileText } from "@/components/icons";
import { Markdown } from "@/components/markdown-lazy";
import { useAttachmentBlob } from "@/hooks/use-attachment-blob";
import { ReasoningPanel } from "./reasoning-panel";
import { MemoryNoticeRow } from "./memory-notice-row";
import { cn } from "@/lib/utils";
import type { Message, MessageAttachment } from "@/lib/types";

function messagePropsEqual(
  prev: {
    message: Message;
    isStreaming?: boolean;
    collapseReasoningByDefault?: boolean;
    onOpenMemorySettings?: () => void;
  },
  next: {
    message: Message;
    isStreaming?: boolean;
    collapseReasoningByDefault?: boolean;
    onOpenMemorySettings?: () => void;
  },
) {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.reasoning === next.message.reasoning &&
    prev.message.reasoningDurationMs === next.message.reasoningDurationMs &&
    prev.message.memoryNotice?.status === next.message.memoryNotice?.status &&
    prev.message.memoryNotice?.content === next.message.memoryNotice?.content &&
    prev.message.attachments?.length === next.message.attachments?.length &&
    prev.isStreaming === next.isStreaming &&
    prev.collapseReasoningByDefault === next.collapseReasoningByDefault &&
    prev.onOpenMemorySettings === next.onOpenMemorySettings
  );
}

function MessageItemInner({
  message,
  isStreaming = false,
  collapseReasoningByDefault = true,
  onOpenMemorySettings,
}: {
  message: Message;
  isStreaming?: boolean;
  collapseReasoningByDefault?: boolean;
  onOpenMemorySettings?: () => void;
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
      onOpenMemorySettings={onOpenMemorySettings}
    />
  );
}

export const MessageItem = memo(MessageItemInner, messagePropsEqual);

function AssistantMessage({
  message,
  isStreaming,
  collapseReasoningByDefault,
  onOpenMemorySettings,
}: {
  message: Message;
  isStreaming: boolean;
  collapseReasoningByDefault: boolean;
  onOpenMemorySettings?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const hasReasoning = Boolean(message.reasoning?.trim());
  const hasContent = Boolean(message.content);
  const isThinking = isStreaming && hasReasoning && !hasContent;
  const memoryNotice = message.memoryNotice;
  const showMemoryNotice = Boolean(memoryNotice);

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

      {hasContent && (
        <>
          <Markdown content={message.content} defer={isStreaming} />
          {isStreaming && <StreamingCursor />}
        </>
      )}

      {!hasContent && !hasReasoning && isStreaming && <StreamingCursor />}

      {showMemoryNotice && memoryNotice && (
        <MemoryNoticeRow
          notice={memoryNotice}
          onOpenMemorySettings={onOpenMemorySettings}
        />
      )}

      {hasContent && !isStreaming && (
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

function UserAttachment({ attachment }: { attachment: MessageAttachment }) {
  const { dataUrl, loading } = useAttachmentBlob(attachment);

  if (attachment.kind === "image") {
    if (loading) {
      return (
        <div className="h-24 w-32 animate-pulse rounded-xl border border-primary-foreground/30 bg-primary" />
      );
    }
    if (dataUrl) {
      return (
        <div className="overflow-hidden rounded-xl border border-primary-foreground/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={attachment.name}
            className="max-h-48 max-w-full object-contain"
          />
        </div>
      );
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary-foreground/30 bg-primary px-3 py-2 text-primary-foreground">
      {attachment.kind === "pdf" ? <FileText size={14} /> : <FileCode2 size={14} />}
      <span className="max-w-[12rem] truncate text-xs">{attachment.name}</span>
    </div>
  );
}
