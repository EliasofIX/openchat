"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Brain } from "@/components/icons";
import { ChatInput } from "./chat-input";
import { ContextUsage } from "./context-usage";
import { useContextUsage } from "@/hooks/use-context-usage";
import type { useAttachments } from "@/hooks/use-attachments";
import { getActiveModel, PROVIDER_LABELS } from "@/lib/providers";
import { REASONING_EFFORT_LABELS } from "@/lib/openrouter";
import { unsupportedReason } from "@/lib/model-capabilities";
import type { PromptCachingMode, PromptCacheUsage } from "@/lib/prompt-cache";
import type { Message, MessageAttachment, UserSettings } from "@/lib/types";
import { glassPill } from "@/lib/utils";

type AttachmentsHook = ReturnType<typeof useAttachments>;

type Props = {
  messages: Message[];
  isStreaming: boolean;
  systemPrompt?: string;
  /** Injected memory user message — counted separately from system. */
  memoryContext?: string;
  contextTokens: number | null;
  promptCachingMode?: PromptCachingMode;
  lastCacheUsage?: PromptCacheUsage | null;
  modelCapabilitiesLoading: boolean;
  modelCapabilitiesError?: string | null;
  memoryToolsUnavailable?: boolean;
  settings: UserSettings;
  attachmentsHook: AttachmentsHook;
  onSend: (text: string, files: MessageAttachment[]) => void;
  onStop: () => void;
  /** Increment to clear the draft (e.g. new chat). */
  resetSignal?: number;
};

function toMessageAttachments(
  ready: AttachmentsHook["readyAttachments"],
): MessageAttachment[] {
  return ready.map(({ id, kind, name, mimeType, dataUrl, textContent }) => ({
    id,
    kind,
    name,
    mimeType,
    dataUrl,
    textContent,
  }));
}

export function ChatComposer({
  messages,
  isStreaming,
  systemPrompt,
  memoryContext,
  contextTokens,
  promptCachingMode = "none",
  lastCacheUsage = null,
  modelCapabilitiesLoading,
  modelCapabilitiesError,
  memoryToolsUnavailable = false,
  settings,
  attachmentsHook,
  onSend,
  onStop,
  resetSignal = 0,
}: Props) {
  const [input, setInput] = useState("");
  const deferredInput = useDeferredValue(input);

  useEffect(() => {
    setInput("");
  }, [resetSignal]);

  const draftAttachments = useMemo(
    () => toMessageAttachments(attachmentsHook.readyAttachments),
    [attachmentsHook.readyAttachments],
  );

  const prevStreamingRef = useRef(false);
  const meterMessagesRef = useRef(messages);

  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current) {
      meterMessagesRef.current = messages.map((m, i) =>
        i === messages.length - 1 && m.role === "assistant" ? { ...m, content: "" } : m,
      );
    } else if (!isStreaming) {
      meterMessagesRef.current = messages;
    }
    prevStreamingRef.current = isStreaming;
  }, [messages, isStreaming]);

  const meterMessages = isStreaming ? meterMessagesRef.current : messages;

  const contextUsage = useContextUsage({
    messages: meterMessages,
    systemPrompt,
    memoryContext,
    draftText: deferredInput,
    draftAttachments,
    contextTokens,
    lastCacheUsage,
  });

  const onSubmit = () => {
    const text = input;
    const files = toMessageAttachments(attachmentsHook.readyAttachments);
    setInput("");
    attachmentsHook.clear();
    onSend(text, files);
  };

  const activeModel = getActiveModel(settings);
  const memoryToolsHint =
    memoryToolsUnavailable && settings.memory.enabled
      ? unsupportedReason("tools", activeModel)
      : null;

  const capabilityWarning = modelCapabilitiesError ? (
    <span
      className={glassPill(
        "inline-flex max-w-xs items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-400",
      )}
      title={modelCapabilitiesError}
    >
      Context limits unavailable
    </span>
  ) : null;

  const memoryWarning = memoryToolsHint ? (
    <span
      className={glassPill(
        "inline-flex max-w-xs items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-400",
      )}
      title={memoryToolsHint}
    >
      Memory read-only
    </span>
  ) : null;

  return (
    <div className="oc-composer-pad z-20 shrink-0 pt-3">
      <div className="mx-auto w-full max-w-3xl px-4">
        {settings.reasoning.enabled ? (
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
            <span
              className={glassPill(
                "inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[10px] font-medium text-foreground",
              )}
            >
              {PROVIDER_LABELS[settings.provider]}
            </span>
            <span
              className={glassPill(
                "inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[10px] font-medium text-foreground",
              )}
            >
              <Brain size={11} className="text-violet-500" />
              Reasoning
              {!settings.reasoning.showInResponse && (
                <span className="text-muted-foreground/70">(hidden)</span>
              )}
              <span className="text-muted-foreground/70">·</span>
              {REASONING_EFFORT_LABELS[settings.reasoning.effort]}
            </span>
            <ContextUsage
              usage={contextUsage}
              loading={modelCapabilitiesLoading}
              promptCaching={settings.promptCaching}
              promptCachingMode={promptCachingMode}
              model={activeModel}
            />
            {capabilityWarning}
            {memoryWarning}
          </div>
        ) : (
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
            <span
              className={glassPill(
                "inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[10px] font-medium text-foreground",
              )}
            >
              {PROVIDER_LABELS[settings.provider]}
              {activeModel && (
                <>
                  <span className="text-muted-foreground/70">·</span>
                  <span className="max-w-[12rem] truncate font-mono">{activeModel}</span>
                </>
              )}
            </span>
            <ContextUsage
              usage={contextUsage}
              loading={modelCapabilitiesLoading}
              promptCaching={settings.promptCaching}
              promptCachingMode={promptCachingMode}
              model={activeModel}
            />
            {capabilityWarning}
            {memoryWarning}
          </div>
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          onStop={onStop}
          isStreaming={isStreaming}
          attachments={attachmentsHook.attachments}
          onAddFiles={(files) => void attachmentsHook.addFiles(files)}
          onRemoveAttachment={attachmentsHook.remove}
          onPaste={attachmentsHook.handlePaste}
          isProcessingAttachments={attachmentsHook.isProcessing}
          hasUnsupportedAttachments={attachmentsHook.hasUnsupported}
        />
        <p className="pointer-events-none pt-2 text-center text-[10px] text-muted-foreground">
          The model can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
