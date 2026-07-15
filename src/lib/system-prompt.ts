// ─────────────────────────────────────────────────────────────────────────────
// system-prompt — stable system text vs dynamic memory context for caching.
//
// Memories are kept out of the system message so providers (especially Gemini)
// can cache the stable system prefix. Memory context is injected as a separate
// user message in the chat route — not stored in conversation history.
// Only include memories when settings.memory.enabled (tools availability is
// unrelated — injection still works when save_memory is unavailable).
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatMessage } from "@/lib/ai-client";
import { memoryToolSystemHint } from "@/lib/memory-tools";
import { webSearchSystemHint } from "@/lib/web-search";
import type { Memory, UserSettings } from "@/lib/types";

export const MEMORY_SECTION_MARKER =
  "The following are things you should remember about the user across conversations:";

/** Stable system prompt — name, custom instructions, tool hints only. */
export function buildStableSystemPrompt(s: UserSettings): string | undefined {
  const lines: string[] = [];
  if (s.name.trim()) lines.push(`The user's name is ${s.name.trim()}.`);
  if (s.customInstructions.trim()) {
    lines.push("The user has provided the following custom instructions:");
    lines.push(s.customInstructions.trim());
  }
  // Tool hints must match tools actually attached (settings only — capability
  // gate happens when building enabledTools for /api/chat).
  if (s.memory.enabled) {
    lines.push(memoryToolSystemHint());
  }
  if (s.webSearch.enabled) {
    lines.push(webSearchSystemHint());
  }
  return lines.length ? lines.join("\n\n") : undefined;
}

/** Dynamic memory list — sent as a separate user message, not in system. */
export function buildMemoryContextContent(
  memories: Memory[],
  memoryEnabled = true,
): string | undefined {
  if (!memoryEnabled) return undefined;

  const items: string[] = [];
  for (const memory of memories) {
    const text = memory.content.trim();
    if (text) items.push(`- ${text}`);
  }
  if (items.length === 0) return undefined;
  return `${MEMORY_SECTION_MARKER}\n\n${items.join("\n")}`;
}

export function buildMemoryContextMessage(
  memories: Memory[],
  memoryEnabled = true,
): ChatMessage | null {
  const content = buildMemoryContextContent(memories, memoryEnabled);
  if (!content) return null;
  return { role: "user", content };
}

/**
 * Full prompt text for callers that still want a single string.
 * Prefer stable + memoryContext separately for chat / context metering.
 */
export function buildFullSystemPrompt(
  s: UserSettings,
  memories: Memory[] = [],
): string | undefined {
  const stable = buildStableSystemPrompt(s);
  const memory = buildMemoryContextContent(memories, s.memory.enabled);
  if (!stable && !memory) return undefined;
  if (!memory) return stable;
  if (!stable) return memory;
  return `${stable}\n\n${memory}`;
}
