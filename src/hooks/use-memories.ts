"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_MEMORIES, storage } from "@/lib/storage";
import type { Memory } from "@/lib/types";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDuplicate(content: string, memories: Memory[]): boolean {
  const normalized = content.trim().toLowerCase();
  return memories.some((m) => m.content.trim().toLowerCase() === normalized);
}

function trimToCap(memories: Memory[]): Memory[] {
  if (memories.length <= MAX_MEMORIES) return memories;

  const sorted = [...memories].sort((a, b) => b.updatedAt - a.updatedAt);
  const autoEvicted = sorted
    .slice(MAX_MEMORIES)
    .filter((m) => m.source === "agent")
    .map((m) => m.id);
  if (autoEvicted.length === 0) return sorted.slice(0, MAX_MEMORIES);

  return sorted.filter((m) => !autoEvicted.includes(m.id)).slice(0, MAX_MEMORIES);
}

export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const memoriesRef = useRef<Memory[]>([]);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  useEffect(() => {
    setMemories(storage.loadMemories());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Memory[]) => {
    const normalized = trimToCap(next);
    memoriesRef.current = normalized;
    setMemories(normalized);
    storage.saveMemories(normalized);
  }, []);

  const add = useCallback(
    (content: string, source: Memory["source"] = "user") => {
      const trimmed = content.trim().slice(0, 500);
      if (!trimmed || isDuplicate(trimmed, memoriesRef.current)) return false;

      const now = Date.now();
      const next: Memory[] = [
        {
          id: makeId(),
          content: trimmed,
          createdAt: now,
          updatedAt: now,
          source,
        },
        ...memoriesRef.current,
      ];
      persist(next);
      return true;
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist(memoriesRef.current.filter((m) => m.id !== id));
    },
    [persist],
  );

  const update = useCallback(
    (id: string, content: string) => {
      const trimmed = content.trim().slice(0, 500);
      if (!trimmed) return false;

      const others = memoriesRef.current.filter((m) => m.id !== id);
      if (isDuplicate(trimmed, others)) return false;

      const now = Date.now();
      persist(
        memoriesRef.current.map((m) =>
          m.id === id ? { ...m, content: trimmed, updatedAt: now } : m,
        ),
      );
      return true;
    },
    [persist],
  );

  return {
    memories,
    hydrated,
    add,
    remove,
    update,
  };
}
