"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  capMemories,
  KEY_MEMORIES,
  storage,
} from "@/lib/storage";
import type { SaveMemoryResult } from "@/lib/memory-tools";
import type { Memory } from "@/lib/types";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDuplicate(content: string, memories: Memory[]): boolean {
  const normalized = content.trim().toLowerCase();
  return memories.some((m) => m.content.trim().toLowerCase() === normalized);
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

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY_MEMORIES) return;
      const loaded = storage.loadMemories();
      memoriesRef.current = loaded;
      setMemories(loaded);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: Memory[]): boolean => {
    const normalized = capMemories(next);
    const previous = memoriesRef.current;
    memoriesRef.current = normalized;
    setMemories(normalized);
    const ok = storage.saveMemories(normalized);
    if (!ok) {
      memoriesRef.current = previous;
      setMemories(previous);
      return false;
    }
    return true;
  }, []);

  const tryAdd = useCallback(
    (content: string, source: Memory["source"] = "user"): SaveMemoryResult => {
      const trimmed = content.trim().slice(0, 500);
      if (!trimmed) return "invalid";
      if (isDuplicate(trimmed, memoriesRef.current)) return "duplicate";

      const now = Date.now();
      const entry: Memory = {
        id: makeId(),
        content: trimmed,
        createdAt: now,
        updatedAt: now,
        source,
      };
      const normalized = capMemories([entry, ...memoriesRef.current]);
      if (!normalized.some((m) => m.id === entry.id)) return "full";

      if (!persist(normalized)) return "storage_failed";
      return "saved";
    },
    [persist],
  );

  const add = useCallback(
    (content: string, source: Memory["source"] = "user") =>
      tryAdd(content, source) === "saved",
    [tryAdd],
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
      return persist(
        memoriesRef.current.map((m) =>
          m.id === id ? { ...m, content: trimmed, updatedAt: now } : m,
        ),
      );
    },
    [persist],
  );

  return {
    memories,
    hydrated,
    add,
    tryAdd,
    remove,
    update,
  };
}
