"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, Message, UserSettings } from "@/lib/types";
import { deriveFallbackTitle, generateChatTitle, shouldGenerateAiTitle } from "@/lib/generate-title";
import { storage } from "@/lib/storage";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const titleGenerationInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    setConversations(storage.loadConversations());
    const storedActiveId = storage.loadActiveId();
    setActiveId(storedActiveId);
    activeIdRef.current = storedActiveId;
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) storage.saveConversations(conversations);
  }, [conversations, hydrated]);

  useEffect(() => {
    if (hydrated) storage.saveActiveId(activeId);
  }, [activeId, hydrated]);

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

      setConversations((prev) => {
        if (isNew) {
          return [
            {
              id,
              title: deriveFallbackTitle(messages),
              messages,
              createdAt: now,
              updatedAt: now,
              aiTitleGenerated: false,
            },
            ...prev,
          ];
        }

        return prev.map((c) =>
          c.id === id
            ? {
                ...c,
                messages,
                updatedAt: now,
                title: c.aiTitleGenerated ? c.title : c.title || deriveFallbackTitle(messages),
              }
            : c,
        );
      });

      return result;
    },
    [],
  );

  const setAiTitle = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, title: title.trim() || c.title, aiTitleGenerated: true, updatedAt: Date.now() }
          : c,
      ),
    );
  }, []);

  const maybeGenerateTitle = useCallback(
    async (
      conversationId: string | null,
      messages: Message[],
      settings: UserSettings,
      aiTitleGenerated?: boolean,
    ) => {
      if (!conversationId) return;
      if (
        !shouldGenerateAiTitle(
          messages,
          aiTitleGenerated,
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

  const remove = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeIdRef.current === id) {
      activeIdRef.current = null;
      setActiveId(null);
    }
  }, []);

  const rename = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c)),
    );
  }, []);

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
