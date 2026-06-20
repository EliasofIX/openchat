"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation, Message } from "@/lib/types";
import { deriveFallbackTitle } from "@/lib/generate-title";
import { storage } from "@/lib/storage";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConversations(storage.loadConversations());
    setActiveId(storage.loadActiveId());
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
    setActiveId(null);
  }, []);

  const upsertActive = useCallback(
    (messages: Message[]): { id: string; aiTitleGenerated: boolean } | null => {
      if (messages.length === 0) return null;
      const now = Date.now();
      let result: { id: string; aiTitleGenerated: boolean } | null = null;

      setConversations((prev) => {
        const id = activeId ?? makeId();
        const existing = prev.find((c) => c.id === id);

        if (!activeId) {
          setActiveId(id);
          result = { id, aiTitleGenerated: false };
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

        result = {
          id,
          aiTitleGenerated: existing?.aiTitleGenerated ?? false,
        };
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
    [activeId],
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

  const remove = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId],
  );

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
    select: setActiveId,
    createNew,
    upsertActive,
    setAiTitle,
    remove,
    rename,
  };
}
