"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  useChat — the entire client-side chat engine.
//
//  Responsibilities:
//   • Hold the current message list.
//   • POST to /api/chat with the history (+ optional system prompt).
//   • Read the response as a raw UTF-8 text stream and append tokens to the
//     latest assistant message as they arrive (RAF-batched for smooth UI).
//   • Abort the stream when the user clicks Stop.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildApiContent } from "@/lib/build-api-content";
import { hydrateMessages } from "@/lib/hydrate-messages";
import type { Message, MessageAttachment, ModelProvider, ReasoningSettings } from "@/lib/types";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type ChatStatus = "idle" | "streaming" | "error";

export type UseChatOptions = {
  initialMessages?: Message[];
  systemPrompt?: string;
  provider?: ModelProvider;
  model?: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
  reasoning?: ReasoningSettings;
  onFinish?: (assistantMessage: Message, allMessages: Message[]) => void;
  onMessagesChange?: (messages: Message[]) => void;
};

type StreamPart = { p: "content" | "reasoning"; t: string };

function isNdjsonStream(contentType: string | null): boolean {
  return contentType?.includes("application/x-ndjson") ?? false;
}

function parseStreamLine(line: string): StreamPart | null {
  try {
    const parsed = JSON.parse(line) as StreamPart;
    if (parsed.p === "content" || parsed.p === "reasoning") return parsed;
    return null;
  } catch {
    return null;
  }
}

function toApiMessage(m: Message): {
  role: Message["role"];
  content: ReturnType<typeof buildApiContent>;
  reasoning?: string;
} {
  const content =
    m.role === "user" && m.attachments?.length
      ? buildApiContent(m.content, m.attachments)
      : m.content;

  if (m.role === "assistant" && m.reasoning) {
    return { role: m.role, content, reasoning: m.reasoning };
  }
  return { role: m.role, content };
}

export function useChat(options: UseChatOptions = {}) {
  const { systemPrompt, provider, model, apiKey, ollamaBaseUrl, reasoning, onFinish, onMessagesChange } = options;

  const [messages, setMessages] = useState<Message[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef(messages);
  const systemPromptRef = useRef(systemPrompt);
  const providerRef = useRef(provider);
  const modelRef = useRef(model);
  const apiKeyRef = useRef(apiKey);
  const ollamaBaseUrlRef = useRef(ollamaBaseUrl);
  const reasoningRef = useRef(reasoning);
  const onFinishRef = useRef(onFinish);
  const onMessagesChangeRef = useRef(onMessagesChange);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);
  useEffect(() => { providerRef.current = provider; }, [provider]);
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { ollamaBaseUrlRef.current = ollamaBaseUrl; }, [ollamaBaseUrl]);
  useEffect(() => { reasoningRef.current = reasoning; }, [reasoning]);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { onMessagesChangeRef.current = onMessagesChange; }, [onMessagesChange]);

  const flushPersist = useCallback((next: Message[]) => {
    onMessagesChangeRef.current?.(next);
  }, []);

  const setAll = useCallback((next: Message[]) => {
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

    setMessages(streamingMessages);
    flushPersist(streamingMessages);
    setStatus("streaming");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";
    let accumulatedReasoning = "";
    let reasoningStartedAt: number | null = null;
    let reasoningDurationMs: number | undefined;
    let aborted = false;
    let rafId: number | null = null;

    const cancelRaf = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const flushAssistantUi = () => {
      rafId = null;
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
          },
        ];
      });
    };

    const scheduleAssistantUi = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(flushAssistantUi);
    };

    const applyPart = (part: StreamPart) => {
      if (part.p === "reasoning") {
        if (!reasoningStartedAt) reasoningStartedAt = Date.now();
        accumulatedReasoning += part.t;
      } else {
        if (reasoningStartedAt && reasoningDurationMs === undefined) {
          reasoningDurationMs = Date.now() - reasoningStartedAt;
        }
        accumulated += part.t;
      }
      scheduleAssistantUi();
    };

    try {
      const hydratedBase = await hydrateMessages(baseMessages);

      const payload: Record<string, unknown> = {
        systemPrompt: systemPromptRef.current,
        messages: hydratedBase.map(toApiMessage),
        provider: providerRef.current ?? "openrouter",
      };

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
      const ndjson = isNdjsonStream(res.headers.get("Content-Type"));
      let lineBuffer = "";

      while (true) {
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
            applyPart(part);
          }
        } else {
          accumulated += chunk;
          scheduleAssistantUi();
        }
      }

      if (ndjson && lineBuffer.trim()) {
        const part = parseStreamLine(lineBuffer);
        if (part) applyPart(part);
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
      cancelRaf();
      if ((err as Error).name === "AbortError") {
        aborted = true;
      } else {
        abortRef.current = null;
        setStatus("error");
        setError((err as Error).message);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.id === assistantId && last.content === "" && !last.reasoning) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        return;
      }
    }

    cancelRaf();
    flushAssistantUi();

    abortRef.current = null;
    setStatus("idle");

    if (aborted && accumulated === "" && accumulatedReasoning === "") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id === assistantId && last.content === "" && !last.reasoning) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      return;
    }

    const finalAssistant: Message = {
      id: assistantId,
      role: "assistant",
      content: accumulated,
      ...(accumulatedReasoning ? { reasoning: accumulatedReasoning } : {}),
      ...(reasoningDurationMs !== undefined ? { reasoningDurationMs } : {}),
      createdAt: Date.now(),
    };
    const finalMessages = [...baseMessages, finalAssistant];
    setMessages(finalMessages);
    flushPersist(finalMessages);
    onFinishRef.current?.(finalAssistant, finalMessages);
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
