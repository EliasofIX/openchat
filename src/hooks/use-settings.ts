"use client";

import { useCallback, useEffect, useState } from "react";
import type { Memory, UserSettings } from "@/lib/types";
import { memoryToolSystemHint } from "@/lib/memory-tools";
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

// Build the system prompt sent to the model from the user's settings.
export function buildSystemPrompt(
  s: UserSettings,
  memories: Memory[] = [],
): string | undefined {
  const lines: string[] = [];
  if (s.name.trim()) lines.push(`The user's name is ${s.name.trim()}.`);
  if (s.customInstructions.trim()) {
    lines.push("The user has provided the following custom instructions:");
    lines.push(s.customInstructions.trim());
  }
  if (s.memory.enabled) {
    lines.push(memoryToolSystemHint());
  }
  if (s.memory.enabled && memories.length > 0) {
    lines.push(
      "The following are things you should remember about the user across conversations:",
    );
    for (const memory of memories) {
      const text = memory.content.trim();
      if (text) lines.push(`- ${text}`);
    }
  }
  return lines.length ? lines.join("\n\n") : undefined;
}
