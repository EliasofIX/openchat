"use client";

// Manages the list of conversations + which one is active. Persists to
// localStorage. Replace with a server/database backend if you add auth.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation, Message } from "@/lib/types";
import { storage } from "@/lib/storage";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const t = first.content.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 60)}…` : t || "New chat";
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
    (messages: Message[]) => {
      if (messages.length === 0) return;
      const now = Date.now();
      setConversations((prev) => {
        const id = activeId ?? makeId();
        if (!activeId) {
          // Promote a new draft to a real conversation on the first message.
          setActiveId(id);
          return [
            { id, title: deriveTitle(messages), messages, createdAt: now, updatedAt: now },
            ...prev,
          ];
        }
        return prev.map((c) =>
          c.id === id
            ? { ...c, messages, updatedAt: now, title: c.title || deriveTitle(messages) }
            : c,
        );
      });
    },
    [activeId],
  );

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
    remove,
    rename,
  };
}
