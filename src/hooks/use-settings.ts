"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserSettings } from "@/lib/types";
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
      };
      storage.saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update, hydrated };
}

// Build the system prompt sent to the model from the user's settings.
export function buildSystemPrompt(s: UserSettings): string | undefined {
  const lines: string[] = [];
  if (s.name.trim()) lines.push(`The user's name is ${s.name.trim()}.`);
  if (s.customInstructions.trim()) {
    lines.push("The user has provided the following custom instructions:");
    lines.push(s.customInstructions.trim());
  }
  return lines.length ? lines.join("\n\n") : undefined;
}
