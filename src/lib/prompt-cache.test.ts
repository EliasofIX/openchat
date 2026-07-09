import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCacheSessionId,
  promptCachingModeForModel,
  resolvePromptCachingMode,
} from "@/lib/prompt-cache";

describe("buildCacheSessionId", () => {
  it("returns undefined when conversation id is null or empty", () => {
    assert.equal(buildCacheSessionId(null, "openai/gpt-4o"), undefined);
    assert.equal(buildCacheSessionId(undefined, "openai/gpt-4o"), undefined);
    assert.equal(buildCacheSessionId("  ", "openai/gpt-4o"), undefined);
  });

  it("joins conversation id and normalized model", () => {
    assert.equal(
      buildCacheSessionId("abc123", " OpenAI/GPT-4o "),
      "abc123:openai/gpt-4o",
    );
  });
});

describe("resolvePromptCachingMode", () => {
  it("treats client 'none' as unknown and falls back to the model id", () => {
    const fromModel = promptCachingModeForModel("anthropic/claude-sonnet-4");
    assert.equal(fromModel, "auto");
    assert.equal(resolvePromptCachingMode("anthropic/claude-sonnet-4", "none"), "auto");
  });

  it("prefers a resolved non-none capabilities mode", () => {
    assert.equal(
      resolvePromptCachingMode("openai/gpt-4o", "explicit"),
      "explicit",
    );
  });

  it("falls back when capabilities mode is omitted", () => {
    assert.equal(
      resolvePromptCachingMode("google/gemini-2.5-flash"),
      promptCachingModeForModel("google/gemini-2.5-flash"),
    );
  });
});
