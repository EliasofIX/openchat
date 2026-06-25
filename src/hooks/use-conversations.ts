"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, Message, UserSettings } from "@/lib/types";
import { deriveFallbackTitle, generateChatTitle, shouldGenerateAiTitle } from "@/lib/generate-title";
import { storage } from "@/lib/storage";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SAVE_DEBOUNCE_MS = 500;

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const titleGenerationInFlight = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConvRef = useRef<Conversation | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const conv = pendingConvRef.current;
    if (!conv) return;
    pendingConvRef.current = null;
    void storage.saveConversation(conv);
  }, []);

  const queueSave = useCallback(
    (conv: Conversation) => {
      pendingConvRef.current = conv;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const next = pendingConvRef.current;
        pendingConvRef.current = null;
        if (next) void storage.saveConversation(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [],
  );

  useEffect(() => {
    void storage
      .migrateIfNeeded()
      .catch((err) => {
        console.warn("[openchat] Conversation migration failed:", err);
      })
      .finally(() => {
        const loaded = storage.loadConversations();
        const storedActiveId = storage.loadActiveId();
        const activeId =
          storedActiveId && loaded.some((c) => c.id === storedActiveId)
            ? storedActiveId
            : null;

        setConversations(loaded);
        setActiveId(activeId);
        activeIdRef.current = activeId;
        setHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (hydrated) storage.saveActiveId(activeId);
  }, [activeId, hydrated]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const conv = pendingConvRef.current;
      if (conv) void storage.saveConversation(conv);
    };
  }, []);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const createNew = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
  }, []);

  const upsertActive = useCallback(
    (messages: Message[]): { id: string; aiTitleGenerated: boolean } | null => {
      if (messages.length === 0) return null;

      const now = Date.now();
      const currentActiveId = activeIdRef.current;
      const id = currentActiveId ?? makeId();
      const isNew = !currentActiveId;
      const existing = conversationsRef.current.find((c) => c.id === id);

      if (isNew) {
        activeIdRef.current = id;
        setActiveId(id);
      }

      const result = {
        id,
        aiTitleGenerated: existing?.aiTitleGenerated ?? false,
      };

      let savedConv: Conversation | null = null;

      setConversations((prev) => {
        const next = isNew
          ? [
              {
                id,
                title: deriveFallbackTitle(messages),
                messages,
                createdAt: now,
                updatedAt: now,
                aiTitleGenerated: false,
              },
              ...prev,
            ]
          : prev.map((c) =>
              c.id === id
                ? {
                    ...c,
                    messages,
                    updatedAt: now,
                    title:
                      c.aiTitleGenerated || titleGenerationInFlight.current.has(id)
                        ? c.title
                        : c.title || deriveFallbackTitle(messages),
                  }
                : c,
            );

        conversationsRef.current = next;
        savedConv = next.find((c) => c.id === id) ?? null;
        return next;
      });

      if (savedConv) {
        if (isNew) {
          flushSave();
          void storage.saveConversation(savedConv);
        } else {
          queueSave(savedConv);
        }
      }
      return result;
    },
    [flushSave, queueSave],
  );

  const setAiTitle = useCallback(
    (id: string, title: string) => {
      let savedConv: Conversation | null = null;

      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === id
            ? { ...c, title: title.trim() || c.title, aiTitleGenerated: true, updatedAt: Date.now() }
            : c,
        );
        conversationsRef.current = next;
        savedConv = next.find((c) => c.id === id) ?? null;
        return next;
      });

      if (savedConv) {
        flushSave();
        void storage.saveConversation(savedConv);
      }
    },
    [flushSave],
  );

  const maybeGenerateTitle = useCallback(
    async (
      conversationId: string | null,
      messages: Message[],
      settings: UserSettings,
    ) => {
      if (!conversationId) return;

      const existing = conversationsRef.current.find((c) => c.id === conversationId);
      if (
        !shouldGenerateAiTitle(
          messages,
          existing?.aiTitleGenerated,
          settings.titleGeneration.enabled,
        )
      ) {
        return;
      }
      if (titleGenerationInFlight.current.has(conversationId)) return;

      titleGenerationInFlight.current.add(conversationId);
      try {
        const title = await generateChatTitle(messages, settings);
        setAiTitle(conversationId, title);
      } catch (err) {
        console.warn("[openchat] Title generation failed:", err);
      } finally {
        titleGenerationInFlight.current.delete(conversationId);
      }
    },
    [setAiTitle],
  );

  const remove = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      void storage.deleteConversation(id);
      if (activeIdRef.current === id) {
        activeIdRef.current = null;
        setActiveId(null);
      }
    },
    [],
  );

  const rename = useCallback(
    (id: string, title: string) => {
      let savedConv: Conversation | null = null;

      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === id ? { ...c, title: title.trim() || c.title, updatedAt: Date.now() } : c,
        );
        savedConv = next.find((c) => c.id === id) ?? null;
        return next;
      });

      if (savedConv) void storage.saveConversation(savedConv);
    },
    [],
  );

  return {
    conversations,
    active,
    activeId,
    hydrated,
    select: useCallback((id: string) => {
      activeIdRef.current = id;
      setActiveId(id);
    }, []),
    createNew,
    upsertActive,
    setAiTitle,
    maybeGenerateTitle,
    remove,
    rename,
  };
}
