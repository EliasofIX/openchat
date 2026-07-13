import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFullSystemPrompt,
  buildMemoryContextContent,
  buildStableSystemPrompt,
  MEMORY_SECTION_MARKER,
} from "@/lib/system-prompt";
import type { Memory, UserSettings } from "@/lib/types";

const memories: Memory[] = [
  {
    id: "1",
    content: "Likes dark mode",
    source: "user",
    createdAt: 1,
    updatedAt: 1,
  },
];

function settings(patch: Partial<UserSettings> = {}): UserSettings {
  return {
    provider: "openrouter",
    openRouterApiKey: "",
    model: "openai/gpt-4o-mini",
    ollamaBaseUrl: "",
    ollamaModel: "",
    name: "",
    customInstructions: "",
    colorAccent: null,
    reasoning: {
      enabled: false,
      effort: "medium",
      showInResponse: true,
      collapseByDefault: false,
    },
    titleGeneration: { enabled: true, provider: "openrouter", model: "" },
    memory: { enabled: true },
    promptCaching: { enabled: true, ttl: "5m" },
    zdrOnly: false,
    tts: { voice: "eve" },
    ...patch,
    memory: patch.memory ?? { enabled: true },
  };
}

describe("buildMemoryContextContent", () => {
  it("returns undefined when memory is disabled even if memories exist", () => {
    assert.equal(buildMemoryContextContent(memories, false), undefined);
  });

  it("includes memories when enabled", () => {
    const content = buildMemoryContextContent(memories, true);
    assert.ok(content?.includes(MEMORY_SECTION_MARKER));
    assert.ok(content?.includes("Likes dark mode"));
  });

  it("defaults to enabled when the flag is omitted", () => {
    assert.ok(buildMemoryContextContent(memories)?.includes("Likes dark mode"));
  });
});

describe("buildStableSystemPrompt / buildFullSystemPrompt", () => {
  it("omits the tool hint and memories when memory is disabled", () => {
    const s = settings({
      name: "Ada",
      memory: { enabled: false },
    });
    const stable = buildStableSystemPrompt(s);
    assert.ok(stable?.includes("Ada"));
    assert.ok(!stable?.includes("save_memory"));

    const full = buildFullSystemPrompt(s, memories);
    assert.equal(full, stable);
    assert.ok(!full?.includes(MEMORY_SECTION_MARKER));
  });

  it("includes tool hint and memories when memory is enabled", () => {
    const s = settings({
      name: "Ada",
      memory: { enabled: true },
    });
    const stable = buildStableSystemPrompt(s);
    assert.ok(stable?.includes("save_memory"));

    const full = buildFullSystemPrompt(s, memories);
    assert.ok(full?.includes(MEMORY_SECTION_MARKER));
    assert.ok(full?.includes("Likes dark mode"));
  });
});
