"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowUp, Plus, Square } from "@/components/icons";
import { AttachmentPreviewList } from "./attachment-preview";
import { ACCEPTED_FILE_TYPES } from "@/lib/attachments";
import { cn, glassPill } from "@/lib/utils";
import type { PendingAttachment } from "@/lib/types";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  attachments: PendingAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  isProcessingAttachments?: boolean;
  hasUnsupportedAttachments?: boolean;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onPaste,
  isProcessingAttachments = false,
  hasUnsupportedAttachments = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      if (canSend) onSubmit();
    }
  };

  const hasReadyAttachments = attachments.some((a) => a.status === "ready");
  const canSend =
    (value.trim().length > 0 || hasReadyAttachments) &&
    !isStreaming &&
    !disabled &&
    !isProcessingAttachments &&
    !hasUnsupportedAttachments;

  return (
    <div>
      <AttachmentPreviewList attachments={attachments} onRemove={onRemoveAttachment} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSubmit();
        }}
        className={cn(
          glassPill(
            "relative flex items-end gap-1.5 rounded-full px-2.5 py-2",
            "bg-card transition-colors duration-200",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
            "[html.has-color-accent_&]:focus-within:border-[var(--user-accent-border)]",
          ),
        )}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onAddFiles(files);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isStreaming || disabled}
          aria-label="Attach files"
          title="Attach images, PDFs, or code files"
          className={cn(
            "mb-0.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition",
            "hover:bg-accent hover:text-foreground disabled:opacity-40",
          )}
        >
          <Plus size={18} />
        </button>

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder="Message…"
          rows={1}
          disabled={disabled}
          className={cn(
            "flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[0.95rem] leading-6 text-foreground outline-none",
            "placeholder:text-muted-foreground",
          )}
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
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
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </form>
    </div>
  );
}
