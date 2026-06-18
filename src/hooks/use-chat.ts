"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  useChat — the entire client-side chat engine in ~110 lines.
//
//  Responsibilities:
//   • Hold the current message list.
//   • POST to /api/chat with the history (+ optional system prompt).
//   • Read the response as a raw UTF-8 text stream and append tokens to the
//     latest assistant message as they arrive.
//   • Abort the stream when the user clicks Stop.
//
//  No dependencies beyond React + the Fetch API. Drop into any component
//  with `const chat = useChat({ initialMessages, systemPrompt, onFinish })`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/types";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type ChatStatus = "idle" | "streaming" | "error";

export type UseChatOptions = {
  initialMessages?: Message[];
  systemPrompt?: string;
  onFinish?: (assistantMessage: Message, allMessages: Message[]) => void;
};

export function useChat(options: UseChatOptions = {}) {
  const { systemPrompt, onFinish } = options;

  const [messages, setMessages] = useState<Message[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Latest values, available inside the long-running send() without
  // re-creating the callback on every render.
  const messagesRef = useRef(messages);
  const systemPromptRef = useRef(systemPrompt);
  const onFinishRef = useRef(onFinish);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  // Replace state wholesale — used when switching conversations.
  const setAll = useCallback((next: Message[]) => {
    setMessages(next);
    setStatus("idle");
    setError(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || abortRef.current) return;

    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const assistantId = makeId();
    const baseMessages = [...messagesRef.current, userMessage];

    setMessages([
      ...baseMessages,
      { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
    ]);
    setStatus("streaming");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";
    let aborted = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemPrompt: systemPromptRef.current,
          messages: baseMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        accumulated += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.id !== assistantId) return prev;
          return [...prev.slice(0, -1), { ...last, content: accumulated }];
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        aborted = true;
      } else {
        abortRef.current = null;
        setStatus("error");
        setError((err as Error).message);
        // Drop the empty assistant placeholder so the UI doesn't show a blank
        // bubble next to the error.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.id === assistantId && last.content === "") {
            return prev.slice(0, -1);
          }
          return prev;
        });
        return;
      }
    }

    abortRef.current = null;
    setStatus("idle");

    if (aborted && accumulated === "") {
      // Stopped before any token streamed; drop the empty placeholder.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id === assistantId && last.content === "") {
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
      createdAt: Date.now(),
    };
    const finalMessages = [...baseMessages, finalAssistant];
    onFinishRef.current?.(finalAssistant, finalMessages);
  }, []);

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
