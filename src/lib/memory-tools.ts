// ─────────────────────────────────────────────────────────────────────────────
// memory-tools — save_memory tool definition and helpers for chat tool-calling.
// ─────────────────────────────────────────────────────────────────────────────

import type { MemoryNotice, MemoryNoticeStatus } from "@/lib/types";
import type { ToolCallDelta } from "@/lib/ai-client";

export type SaveMemoryResult = MemoryNoticeStatus | "invalid";

export const SAVE_MEMORY_TOOL_NAME = "save_memory";

export const MEMORY_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: SAVE_MEMORY_TOOL_NAME,
    description:
      "Save a durable fact about the user to long-term memory for future chats. Use when they share a preference, personal detail, or explicitly ask you to remember something. Do not save transient or conversation-specific details.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "A concise fact to remember (one sentence).",
        },
      },
      required: ["content"],
    },
  },
};

export const MEMORY_TOOLS = [MEMORY_TOOL_DEFINITION];

export type CompletedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type MemoryToolCallWire = {
  p: "tool_call";
  id: string;
  name: string;
  arguments: string;
};

export function memoryToolSystemHint(): string {
  return (
    "You have a save_memory tool. Use it when the user shares durable personal facts, " +
    "preferences, or asks you to remember something for future conversations."
  );
}

export function createToolCallAccumulator() {
  const byIndex = new Map<number, { id: string; name: string; arguments: string }>();

  return {
    push(deltas: ToolCallDelta[] | undefined | null) {
      if (!deltas?.length) return;
      for (const delta of deltas) {
        const index = delta.index ?? 0;
        const current = byIndex.get(index) ?? { id: "", name: "", arguments: "" };
        if (delta.id) current.id = delta.id;
        if (delta.function?.name) current.name = delta.function.name;
        if (delta.function?.arguments) current.arguments += delta.function.arguments;
        byIndex.set(index, current);
      }
    },
    flush(): CompletedToolCall[] {
      return [...byIndex.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call)
        .filter((call) => call.id && call.name);
    },
    reset() {
      byIndex.clear();
    },
  };
}

export function parseSaveMemoryArguments(argumentsJson: string): string | null {
  const trimmed = argumentsJson.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { content?: unknown };
    if (typeof parsed.content !== "string") return null;
    const content = parsed.content.trim().slice(0, 500);
    return content || null;
  } catch {
    return null;
  }
}

export function executeSaveMemoryTool(
  argumentsJson: string,
  save: (content: string) => SaveMemoryResult,
): string {
  const content = parseSaveMemoryArguments(argumentsJson);
  if (!content) return "Invalid memory content.";
  switch (save(content)) {
    case "saved":
      return "Saved to memory.";
    case "duplicate":
      return "Already remembered.";
    case "full":
      return "Memory is full.";
    default:
      return "Invalid memory content.";
  }
}

export function memoryNoticeFromSave(
  content: string | null,
  result: SaveMemoryResult,
): MemoryNotice | null {
  if (!content || result === "invalid") return null;
  if (result === "full") return { status: "full" };
  return { status: result, content };
}

export function mergeMemoryNotice(
  prev: MemoryNotice | undefined,
  next: MemoryNotice,
): MemoryNotice {
  if (!prev) return next;
  if (prev.status === "saved") return prev;
  if (next.status === "saved") return next;
  return next;
}

export function toWireToolCall(call: CompletedToolCall): MemoryToolCallWire {
  return {
    p: "tool_call",
    id: call.id,
    name: call.name,
    arguments: call.arguments,
  };
}

export function isMemoryToolCallWire(
  value: unknown,
): value is MemoryToolCallWire {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as MemoryToolCallWire;
  return (
    obj.p === "tool_call" &&
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    typeof obj.arguments === "string"
  );
}
