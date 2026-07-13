import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  __resetTtsCacheForTests,
  __ttsCacheMemoryStats,
  getTtsAudio,
  putTtsAudio,
  TTS_CACHE_MAX_BYTES,
  TTS_CACHE_MAX_ENTRIES,
} from "@/lib/tts-cache";

describe("tts-cache", () => {
  it("returns null for a miss and the same blob after put", async () => {
    __resetTtsCacheForTests();
    const blob = new Blob(["audio-a"], { type: "audio/mpeg" });
    assert.equal(await getTtsAudio("eve", "hello world"), null);
    await putTtsAudio("eve", "hello world", blob);
    assert.equal(await getTtsAudio("eve", "hello world"), blob);
  });

  it("keys by voice so the same text can cache separately", async () => {
    __resetTtsCacheForTests();
    const eve = new Blob(["eve"], { type: "audio/mpeg" });
    const ara = new Blob(["ara"], { type: "audio/mpeg" });
    await putTtsAudio("eve", "same text", eve);
    await putTtsAudio("ara", "same text", ara);
    assert.equal(await getTtsAudio("eve", "same text"), eve);
    assert.equal(await getTtsAudio("ara", "same text"), ara);
  });

  it("keys by ZDR mode so enabling ZDR-only does not reuse non-ZDR audio", async () => {
    __resetTtsCacheForTests();
    const open = new Blob(["open"], { type: "audio/mpeg" });
    const zdr = new Blob(["zdr"], { type: "audio/mpeg" });
    await putTtsAudio("eve", "same text", open, false);
    await putTtsAudio("eve", "same text", zdr, true);
    assert.equal(await getTtsAudio("eve", "same text", false), open);
    assert.equal(await getTtsAudio("eve", "same text", true), zdr);
  });

  it("evicts oldest entries when over the entry cap", async () => {
    __resetTtsCacheForTests();
    for (let i = 0; i < TTS_CACHE_MAX_ENTRIES + 3; i++) {
      await putTtsAudio("eve", `line-${i}`, new Blob([`b${i}`], { type: "audio/mpeg" }));
    }
    const stats = __ttsCacheMemoryStats();
    assert.ok(stats.entries <= TTS_CACHE_MAX_ENTRIES);
    assert.equal(await getTtsAudio("eve", "line-0"), null);
    assert.ok(await getTtsAudio("eve", `line-${TTS_CACHE_MAX_ENTRIES + 2}`));
  });

  it("evicts when over the byte budget", async () => {
    __resetTtsCacheForTests();
    const chunk = TTS_CACHE_MAX_BYTES / 4;
    const big = new Blob([new Uint8Array(chunk)], { type: "audio/mpeg" });
    await putTtsAudio("eve", "a", big);
    await putTtsAudio("eve", "b", big);
    await putTtsAudio("eve", "c", big);
    await putTtsAudio("eve", "d", big);
    await putTtsAudio("eve", "e", big);
    const stats = __ttsCacheMemoryStats();
    assert.ok(stats.bytes <= TTS_CACHE_MAX_BYTES);
    assert.ok(stats.entries < 5);
    assert.equal(await getTtsAudio("eve", "a"), null);
  });
});
