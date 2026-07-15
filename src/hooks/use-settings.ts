"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserSettings } from "@/lib/types";
import { buildStableSystemPrompt } from "@/lib/system-prompt";
import { DEFAULT_SETTINGS, storage } from "@/lib/storage";

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(storage.loadSettings());
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next: UserSettings = {
        ...prev,
        ...patch,
        reasoning: patch.reasoning
          ? { ...prev.reasoning, ...patch.reasoning }
          : prev.reasoning,
        titleGeneration: patch.titleGeneration
          ? { ...prev.titleGeneration, ...patch.titleGeneration }
          : prev.titleGeneration,
        memory: patch.memory ? { ...prev.memory, ...patch.memory } : prev.memory,
        webSearch: patch.webSearch
          ? { ...prev.webSearch, ...patch.webSearch }
          : prev.webSearch,
        promptCaching: patch.promptCaching
          ? { ...prev.promptCaching, ...patch.promptCaching }
          : prev.promptCaching,
      };
      storage.saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update, hydrated };
}

export { buildStableSystemPrompt };
