import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTtsAudio, putTtsAudio } from "@/lib/tts-cache";

describe("tts-cache", () => {
  it("returns null for a miss and the same blob after put", () => {
    const blob = new Blob(["audio-a"], { type: "audio/mpeg" });
    assert.equal(getTtsAudio("eve", "hello world"), null);
    putTtsAudio("eve", "hello world", blob);
    assert.equal(getTtsAudio("eve", "hello world"), blob);
  });

  it("keys by voice so the same text can cache separately", () => {
    const eve = new Blob(["eve"], { type: "audio/mpeg" });
    const ara = new Blob(["ara"], { type: "audio/mpeg" });
    putTtsAudio("eve", "same text", eve);
    putTtsAudio("ara", "same text", ara);
    assert.equal(getTtsAudio("eve", "same text"), eve);
    assert.equal(getTtsAudio("ara", "same text"), ara);
  });
});
