"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  useChat — the entire client-side chat engine.
//
//  Responsibilities:
//   • Hold the current message list.
//   • POST to /api/chat with the history (+ optional system prompt).
//   • Read the response as a raw UTF-8 text stream and append tokens to the
//     latest assistant message as they arrive (RAF-batched for smooth UI).
//   • Abort the stream when the user clicks Stop or the conversation changes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildApiContent } from "@/lib/build-api-content";
import { findMissingAttachmentNames, hydrateMessages } from "@/lib/hydrate-messages";
import {
  executeSaveMemoryTool,
  isMemoryToolCallWire,
  mergeMemoryNotice,
  memoryNoticeFromSave,
  memoryNoticeFromToolRoundLimit,
  parseSaveMemoryArguments,
  SAVE_MEMORY_TOOL_NAME,
  type CompletedToolCall,
  type SaveMemoryResult,
} from "@/lib/memory-tools";
import { reconcileReasoningAndContent } from "@/lib/reasoning";
import type { PromptCacheUsage } from "@/lib/prompt-cache";
import type {
  MemoryNotice,
  Message,
  MessageAttachment,
  ModelProvider,
  PromptCachingSettings,
  ReasoningSettings,
} from "@/lib/types";
import type { ToolCall } from "@/lib/ai-client";

const MAX_TOOL_ROUNDS = 3;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type ChatStatus = "idle" | "streaming" | "error";

export type UseChatOptions = {
  initialMessages?: Message[];
  systemPrompt?: string;
  memoryContext?: string;
  provider?: ModelProvider;
  model?: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
  reasoning?: ReasoningSettings;
  memoryEnabled?: boolean;
  promptCaching?: PromptCachingSettings;
  promptCachingMode?: import("@/lib/prompt-cache").PromptCachingMode;
  sessionId?: string | null;
  onSaveMemory?: (content: string) => SaveMemoryResult;
  onFinish?: (assistantMessage: Message, allMessages: Message[]) => void;
  onMessagesChange?: (messages: Message[]) => void;
  onCacheUsage?: (usage: PromptCacheUsage) => void;
};

type StreamPart =
  | { p: "content" | "reasoning"; t: string }
  | { p: "tool_call"; id: string; name: string; arguments: string }
  | { p: "usage"; prompt: number; cached: number; written: number };

type ApiPayloadMessage = {
  role: "user" | "assistant" | "tool";
  content?: string | ReturnType<typeof buildApiContent> | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

function isNdjsonStream(
  contentType: string | null,
  memoryEnabled: boolean,
  promptCachingEnabled: boolean,
): boolean {
  if (contentType?.includes("application/x-ndjson")) return true;
  return memoryEnabled || promptCachingEnabled;
}

function parseStreamLine(line: string): StreamPart | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (isMemoryToolCallWire(parsed)) return parsed;
    const part = parsed as {
      p?: string;
      t?: string;
      prompt?: number;
      cached?: number;
      written?: number;
    };
    if (part.p === "usage") {
      return {
        p: "usage",
        prompt: part.prompt ?? 0,
        cached: part.cached ?? 0,
        written: part.written ?? 0,
      };
    }
    if (part.p === "content" || part.p === "reasoning") {
      return { p: part.p, t: part.t ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}

function toWireToolCall(call: CompletedToolCall): ToolCall {
  return {
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.arguments },
  };
}

function toApiMessage(m: Message): {
  role: Message["role"];
  content: ReturnType<typeof buildApiContent>;
} {
  const content =
    m.role === "user" && m.attachments?.length
      ? buildApiContent(m.content, m.attachments)
      : m.content;

  return { role: m.role, content };
}

function reconcileAssistantText(
  reasoning: string,
  content: string,
  settings: ReasoningSettings | undefined,
): { reasoning: string; content: string } {
  if (settings?.enabled && settings.showInResponse) {
    return reconcileReasoningAndContent(reasoning, content);
  }
  return { reasoning, content };
}

export function useChat(options: UseChatOptions = {}) {
  const {
    systemPrompt,
    memoryContext,
    provider,
    model,
    apiKey,
    ollamaBaseUrl,
    reasoning,
    memoryEnabled,
    promptCaching,
    promptCachingMode,
    sessionId,
    onSaveMemory,
    onFinish,
    onMessagesChange,
    onCacheUsage,
  } = options;

  const [messages, setMessages] = useState<Message[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef(messages);
  const systemPromptRef = useRef(systemPrompt);
  const memoryContextRef = useRef(memoryContext);
  const providerRef = useRef(provider);
  const modelRef = useRef(model);
  const apiKeyRef = useRef(apiKey);
  const ollamaBaseUrlRef = useRef(ollamaBaseUrl);
  const reasoningRef = useRef(reasoning);
  const memoryEnabledRef = useRef(memoryEnabled);
  const promptCachingRef = useRef(promptCaching);
  const promptCachingModeRef = useRef(promptCachingMode);
  const sessionIdRef = useRef(sessionId);
  const onSaveMemoryRef = useRef(onSaveMemory);
  const onFinishRef = useRef(onFinish);
  const onMessagesChangeRef = useRef(onMessagesChange);
  const onCacheUsageRef = useRef(onCacheUsage);
  const abortRef = useRef<AbortController | null>(null);
  const streamGenRef = useRef(0);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);
  useEffect(() => { memoryContextRef.current = memoryContext; }, [memoryContext]);
  useEffect(() => { providerRef.current = provider; }, [provider]);
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { ollamaBaseUrlRef.current = ollamaBaseUrl; }, [ollamaBaseUrl]);
  useEffect(() => { reasoningRef.current = reasoning; }, [reasoning]);
  useEffect(() => { memoryEnabledRef.current = memoryEnabled; }, [memoryEnabled]);
  useEffect(() => { promptCachingRef.current = promptCaching; }, [promptCaching]);
  useEffect(() => { promptCachingModeRef.current = promptCachingMode; }, [promptCachingMode]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { onSaveMemoryRef.current = onSaveMemory; }, [onSaveMemory]);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { onMessagesChangeRef.current = onMessagesChange; }, [onMessagesChange]);
  useEffect(() => { onCacheUsageRef.current = onCacheUsage; }, [onCacheUsage]);

  const flushPersist = useCallback((next: Message[]) => {
    onMessagesChangeRef.current?.(next);
  }, []);

  const setAll = useCallback((next: Message[]) => {
    streamGenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages(next);
    setStatus("idle");
    setError(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(async (text: string, attachments: MessageAttachment[] = []) => {
    const trimmed = text.trim();
    const hasAttachments = attachments.length > 0;
    if ((!trimmed && !hasAttachments) || abortRef.current) return;

    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content: trimmed,
      ...(hasAttachments ? { attachments } : {}),
      createdAt: Date.now(),
    };
    const assistantId = makeId();
    const baseMessages = [...messagesRef.current, userMessage];
    const streamingMessages: Message[] = [
      ...baseMessages,
      { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
    ];

    const streamGen = streamGenRef.current;

    setMessages(streamingMessages);
    flushPersist(streamingMessages);
    setStatus("streaming");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const isStale = () => streamGen !== streamGenRef.current;

    let accumulated = "";
    let accumulatedReasoning = "";
    let memoryNotice: MemoryNotice | undefined;
    let reasoningStartedAt: number | null = null;
    let reasoningDurationMs: number | undefined;
    let aborted = false;
    // UI flush scheduling. Normally one render per animation frame (~60fps, smooth).
    // On battery / hidden / blurred, the desktop shell sets `.low-power` on <html>
    // (see electron/preload.js); there we coalesce to ~10fps. Markdown uses
    // `useDeferredValue` (see markdown.tsx `defer` prop) so parsing stays off
    // the hot path even when these UI flushes run.
    let flushTimer: number | null = null;
    let flushIsRaf = false;

    const cancelFlush = () => {
      if (flushTimer === null) return;
      if (flushIsRaf) cancelAnimationFrame(flushTimer);
      else clearTimeout(flushTimer);
      flushTimer = null;
    };

    const flushAssistantUi = () => {
      if (isStale()) return;
      flushTimer = null;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.id !== assistantId) return prev;
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content: accumulated,
            ...(accumulatedReasoning ? { reasoning: accumulatedReasoning } : {}),
            ...(reasoningDurationMs !== undefined ? { reasoningDurationMs } : {}),
            ...(memoryNotice ? { memoryNotice } : {}),
          },
        ];
      });
    };

    const scheduleAssistantUi = () => {
      if (isStale() || flushTimer !== null) return;
      const lowPower =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("low-power");
      if (lowPower) {
        flushIsRaf = false;
        flushTimer = window.setTimeout(flushAssistantUi, 100);
      } else {
        flushIsRaf = true;
        flushTimer = requestAnimationFrame(flushAssistantUi);
      }
    };

    const finalizeAssistant = (
      content: string,
      reasoningText: string,
    ): { content: string; reasoning: string } =>
      reconcileAssistantText(reasoningText, content, reasoningRef.current);

    const persistMessages = (
      content: string,
      reasoningText: string,
      durationMs: number | undefined,
    ) => {
      if (isStale()) return;

      const split = finalizeAssistant(content, reasoningText);
      const hasPartial = split.content !== "" || split.reasoning !== "";

      if (!hasPartial) {
        setMessages(baseMessages);
        flushPersist(baseMessages);
        return;
      }

      const finalAssistant: Message = {
        id: assistantId,
        role: "assistant",
        content: split.content,
        ...(split.reasoning ? { reasoning: split.reasoning } : {}),
        ...(durationMs !== undefined ? { reasoningDurationMs: durationMs } : {}),
        ...(memoryNotice ? { memoryNotice } : {}),
        createdAt: Date.now(),
      };
      const finalMessages = [...baseMessages, finalAssistant];
      setMessages(finalMessages);
      flushPersist(finalMessages);
      return finalAssistant;
    };

    const completeStream = (
      content: string,
      reasoningText: string,
      durationMs: number | undefined,
    ) => {
      const finalAssistant = persistMessages(content, reasoningText, durationMs);
      if (finalAssistant) {
        onFinishRef.current?.(finalAssistant, [...baseMessages, finalAssistant]);
      }
    };

    try {
      const hydratedBase = await hydrateMessages(baseMessages);
      if (isStale()) return;

      const missing = findMissingAttachmentNames(hydratedBase);
      if (missing.length > 0) {
        throw new Error(
          `Attachment unavailable: ${missing.join(", ")}. The file data may have been cleared from browser storage.`,
        );
      }

      const baseApiMessages = hydratedBase.map(toApiMessage);
      let followUpMessages: ApiPayloadMessage[] = [];
      let toolExecutions = 0;

      // Freeze prompt context for the whole send — memory saves during tool
      // rounds must not bust the cacheable prefix on follow-up HTTP requests.
      const frozenSystemPrompt = systemPromptRef.current;
      const frozenMemoryContext = memoryContextRef.current;

      while (true) {
        if (isStale()) return;

        const payload: Record<string, unknown> = {
          systemPrompt: frozenSystemPrompt,
          messages: [...baseApiMessages, ...followUpMessages],
          provider: providerRef.current ?? "openrouter",
          memoryEnabled: Boolean(memoryEnabledRef.current),
        };

        if (frozenMemoryContext) {
          payload.memoryContext = frozenMemoryContext;
        }

        if (promptCachingRef.current) {
          payload.promptCaching = promptCachingRef.current;
        }

        if (promptCachingModeRef.current) {
          payload.promptCachingMode = promptCachingModeRef.current;
        }

        const resolvedSessionId = sessionIdRef.current?.trim();
        if (resolvedSessionId) payload.sessionId = resolvedSessionId;

        const resolvedModel = modelRef.current?.trim();
        if (resolvedModel) payload.model = resolvedModel;

        const resolvedKey = apiKeyRef.current?.trim();
        if (resolvedKey) payload.apiKey = resolvedKey;

        const resolvedOllamaUrl = ollamaBaseUrlRef.current?.trim();
        if (resolvedOllamaUrl) payload.ollamaBaseUrl = resolvedOllamaUrl;

        if (reasoningRef.current) payload.reasoning = reasoningRef.current;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(payload),
        });

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const ndjson = isNdjsonStream(
          res.headers.get("Content-Type"),
          Boolean(memoryEnabledRef.current),
          Boolean(
            promptCachingRef.current?.enabled &&
              (providerRef.current ?? "openrouter") === "openrouter",
          ),
        );
        let lineBuffer = "";
        let roundContent = "";
        let roundReasoning = "";
        const toolCalls: CompletedToolCall[] = [];

        const applyRoundPart = (part: StreamPart) => {
          if (part.p === "usage") {
            if (!isStale()) {
              onCacheUsageRef.current?.({
                promptTokens: part.prompt,
                cachedTokens: part.cached,
                cacheWriteTokens: part.written,
              });
            }
            return;
          }
          if (part.p === "tool_call") {
            toolCalls.push({
              id: part.id,
              name: part.name,
              arguments: part.arguments,
            });
            return;
          }
          if (part.p === "reasoning") {
            if (!reasoningStartedAt) reasoningStartedAt = Date.now();
            roundReasoning += part.t;
          } else {
            if (reasoningStartedAt && reasoningDurationMs === undefined) {
              reasoningDurationMs = Date.now() - reasoningStartedAt;
            }
            roundContent += part.t;
          }
          accumulatedReasoning += part.p === "reasoning" ? part.t : "";
          accumulated += part.p === "content" ? part.t : "";
          scheduleAssistantUi();
        };

        while (true) {
          if (isStale()) {
            await reader.cancel().catch(() => {});
            return;
          }

          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;

          if (ndjson) {
            lineBuffer += chunk;
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              const part = parseStreamLine(line);
              if (!part) continue;
              applyRoundPart(part);
            }
          } else {
            roundContent += chunk;
            accumulated += chunk;
            scheduleAssistantUi();
          }
        }

        if (ndjson && lineBuffer.trim()) {
          const part = parseStreamLine(lineBuffer);
          if (part) applyRoundPart(part);
        }

        if (toolCalls.length === 0) break;

        if (toolExecutions >= MAX_TOOL_ROUNDS) {
          memoryNotice = mergeMemoryNotice(
            memoryNotice,
            memoryNoticeFromToolRoundLimit(),
          );
          scheduleAssistantUi();
          break;
        }

        if (isStale()) return;

        const saveMemory = onSaveMemoryRef.current;
        const toolResults: ApiPayloadMessage[] = toolCalls.map((call) => {
          if (call.name === SAVE_MEMORY_TOOL_NAME && saveMemory) {
            const parsedContent = parseSaveMemoryArguments(call.arguments);
            const result = parsedContent ? saveMemory(parsedContent) : ("invalid" as const);
            const notice = memoryNoticeFromSave(parsedContent, result);
            if (notice) {
              memoryNotice = mergeMemoryNotice(memoryNotice, notice);
              scheduleAssistantUi();
            }
            return {
              role: "tool",
              tool_call_id: call.id,
              content: executeSaveMemoryTool(call.arguments, () => result),
            };
          }
          return {
            role: "tool",
            tool_call_id: call.id,
            content: "Unsupported tool.",
          };
        });

        followUpMessages = [
          ...followUpMessages,
          {
            role: "assistant",
            content: roundContent || null,
            tool_calls: toolCalls.map(toWireToolCall),
          },
          ...toolResults,
        ];
        toolExecutions += 1;
      }

      if (
        reasoningStartedAt &&
        reasoningDurationMs === undefined &&
        accumulatedReasoning
      ) {
        reasoningDurationMs = Date.now() - reasoningStartedAt;
        scheduleAssistantUi();
      }
    } catch (err) {
      cancelFlush();
      if ((err as Error).name === "AbortError") {
        aborted = true;
      } else {
        abortRef.current = null;
        if (isStale()) return;

        flushAssistantUi();

        persistMessages(accumulated, accumulatedReasoning, reasoningDurationMs);
        setStatus("error");
        setError((err as Error).message);
        return;
      }
    }

    cancelFlush();
    if (isStale()) {
      abortRef.current = null;
      return;
    }

    flushAssistantUi();

    const split = finalizeAssistant(accumulated, accumulatedReasoning);
    accumulatedReasoning = split.reasoning;
    accumulated = split.content;

    abortRef.current = null;
    setStatus("idle");

    if (aborted && accumulated === "" && accumulatedReasoning === "") {
      setMessages(baseMessages);
      flushPersist(baseMessages);
      return;
    }

    completeStream(accumulated, accumulatedReasoning, reasoningDurationMs);
  }, [flushPersist]);

  return {
    messages,
    status,
    error,
    send,
    stop,
    setMessages: setAll,
    isStreaming: status === "streaming",
  };
}
