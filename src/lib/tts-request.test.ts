import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROK_TTS_MAX_CHARS, validateTtsRequest } from "@/lib/tts";

describe("validateTtsRequest", () => {
  it("rejects empty text", () => {
    const result = validateTtsRequest({ text: "  " });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });

  it("rejects text over the character cap", () => {
    const result = validateTtsRequest({ text: "a".repeat(GROK_TTS_MAX_CHARS + 1) });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.match(result.message, /character limit/i);
    }
  });

  it("rejects unknown voices", () => {
    const result = validateTtsRequest({ text: "hi", voice: "alloy" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /Unsupported voice/);
  });

  it("accepts a valid payload", () => {
    const result = validateTtsRequest({ text: "hello", voice: "ara" });
    assert.deepEqual(result, { ok: true, text: "hello", voice: "ara" });
  });
});
