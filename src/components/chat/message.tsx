"use client";

import { memo, useState } from "react";
import { Check, Copy, FileCode2, FileText, Loader2, Volume2 } from "@/components/icons";
import { Markdown } from "@/components/markdown-lazy";
import { useAttachmentBlob } from "@/hooks/use-attachment-blob";
import { useMessageTts } from "@/hooks/use-message-tts";
import { ReasoningPanel } from "./reasoning-panel";
import { SourcesPanel } from "./sources-panel";
import { MemoryNoticeRow } from "./memory-notice-row";
import { cn, touchVisible } from "@/lib/utils";
import type { GrokTtsVoice, Message, MessageAttachment } from "@/lib/types";

function sourcesEqual(
  a: Message["sources"] | undefined,
  b: Message["sources"] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (s, i) =>
      s.index === b[i]?.index && s.url === b[i]?.url && s.title === b[i]?.title,
  );
}

function messagePropsEqual(
  prev: {
    message: Message;
    isStreaming?: boolean;
    collapseReasoningByDefault?: boolean;
    onOpenMemorySettings?: () => void;
    ttsVoice?: GrokTtsVoice;
    openRouterApiKey?: string;
    zdrOnly?: boolean;
  },
  next: {
    message: Message;
    isStreaming?: boolean;
    collapseReasoningByDefault?: boolean;
    onOpenMemorySettings?: () => void;
    ttsVoice?: GrokTtsVoice;
    openRouterApiKey?: string;
    zdrOnly?: boolean;
  },
) {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.reasoning === next.message.reasoning &&
    prev.message.reasoningDurationMs === next.message.reasoningDurationMs &&
    prev.message.memoryNotice?.status === next.message.memoryNotice?.status &&
    prev.message.memoryNotice?.content === next.message.memoryNotice?.content &&
    sourcesEqual(prev.message.sources, next.message.sources) &&
    prev.message.attachments?.length === next.message.attachments?.length &&
    prev.isStreaming === next.isStreaming &&
    prev.collapseReasoningByDefault === next.collapseReasoningByDefault &&
    prev.onOpenMemorySettings === next.onOpenMemorySettings &&
    prev.ttsVoice === next.ttsVoice &&
    prev.openRouterApiKey === next.openRouterApiKey &&
    prev.zdrOnly === next.zdrOnly
  );
}

function MessageItemInner({
  message,
  isStreaming = false,
  collapseReasoningByDefault = true,
  onOpenMemorySettings,
  ttsVoice = "eve",
  openRouterApiKey = "",
  zdrOnly = false,
}: {
  message: Message;
  isStreaming?: boolean;
  collapseReasoningByDefault?: boolean;
  onOpenMemorySettings?: () => void;
  ttsVoice?: GrokTtsVoice;
  openRouterApiKey?: string;
  zdrOnly?: boolean;
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
      ttsVoice={ttsVoice}
      openRouterApiKey={openRouterApiKey}
      zdrOnly={zdrOnly}
    />
  );
}

export const MessageItem = memo(MessageItemInner, messagePropsEqual);

function AssistantMessage({
  message,
  isStreaming,
  collapseReasoningByDefault,
  onOpenMemorySettings,
  ttsVoice,
  openRouterApiKey,
  zdrOnly,
}: {
  message: Message;
  isStreaming: boolean;
  collapseReasoningByDefault: boolean;
  onOpenMemorySettings?: () => void;
  ttsVoice: GrokTtsVoice;
  openRouterApiKey: string;
  zdrOnly: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { status: ttsStatus, toggle: toggleTts } = useMessageTts(message.id);
  const hasReasoning = Boolean(message.reasoning?.trim());
  const hasContent = Boolean(message.content);
  const isThinking = isStreaming && hasReasoning && !hasContent;
  const memoryNotice = message.memoryNotice;
  const showMemoryNotice = Boolean(memoryNotice);
  const sources = message.sources;
  const hasSources = Boolean(sources?.length);

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
          <Markdown
            content={message.content}
            sources={sources}
            defer={isStreaming}
          />
          {isStreaming && <StreamingCursor />}
        </>
      )}

      {!hasContent && !hasReasoning && isStreaming && <StreamingCursor />}

      {hasSources && sources && (
        <SourcesPanel sources={sources} isSearching={isStreaming && !hasContent} />
      )}

      {showMemoryNotice && memoryNotice && (
        <MemoryNoticeRow
          notice={memoryNotice}
          onOpenMemorySettings={onOpenMemorySettings}
        />
      )}

      {hasContent && !isStreaming && (
        <div
          className={cn(
            "mt-1.5 -ml-1 flex h-6 items-center gap-1",
            ttsStatus === "idle" ? touchVisible : "opacity-100",
          )}
        >
          <button
            type="button"
            onClick={() => void toggleTts(message.content, ttsVoice, openRouterApiKey, zdrOnly)}
            disabled={ttsStatus === "loading"}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground",
              "transition hover:bg-muted hover:text-foreground",
              ttsStatus === "loading" && "opacity-60",
              (ttsStatus === "playing" || ttsStatus === "paused") && "text-foreground",
            )}
            aria-label={
              ttsStatus === "idle" || ttsStatus === "loading"
                ? "Read aloud"
                : "Stop read aloud"
            }
          >
            {ttsStatus === "loading" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Volume2 size={12} />
            )}
            <span>
              {ttsStatus === "loading"
                ? "Loading"
                : ttsStatus === "playing"
                  ? "Playing"
                  : ttsStatus === "paused"
                    ? "Paused"
                    : "Read aloud"}
            </span>
          </button>
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
