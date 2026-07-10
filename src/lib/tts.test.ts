import assert from "node:assert/strict";
import test from "node:test";
import { GROK_TTS_MAX_CHARS, markdownToSpeechText } from "@/lib/tts";

test("markdownToSpeechText strips common markdown", () => {
  const input = "# Hello\n\nThis is **bold** and `code`.\n\n- one\n- two";
  assert.equal(markdownToSpeechText(input), "Hello This is bold and code. one two");
});

test("markdownToSpeechText truncates very long input", () => {
  const long = "a".repeat(GROK_TTS_MAX_CHARS + 10);
  const out = markdownToSpeechText(long);
  assert.equal(out.length, GROK_TTS_MAX_CHARS);
  assert.ok(out.endsWith("…"));
});
