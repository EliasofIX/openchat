// ─────────────────────────────────────────────────────────────────────────────
// Shared Grok Voice TTS player — one active message at a time.
// useSyncExternalStore so every message + the now-playing bar stay in sync.
// Abort + generation counters so superseded fetches never start the wrong audio.
// Synthesized audio is LRU-cached (voice + text) so replays skip the network.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getTtsAudio, putTtsAudio } from "@/lib/tts-cache";
import { markdownToSpeechText } from "@/lib/tts";
import type { GrokTtsVoice } from "@/lib/types";

export type TtsStatus = "idle" | "loading" | "playing" | "paused";

export type TtsSnapshot = {
  messageId: string | null;
  status: TtsStatus;
  rate: number;
  voice: GrokTtsVoice | null;
};

export const TTS_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

const IDLE: TtsSnapshot = {
  messageId: null,
  status: "idle",
  rate: 1,
  voice: null,
};

let snapshot: TtsSnapshot = IDLE;
const listeners = new Set<() => void>();

let generation = 0;
let abortController: AbortController | null = null;
let audio: HTMLAudioElement | null = null;
let blobUrl: string | null = null;
let cached: { text: string; apiKey: string } | null = null;

function emit(next: TtsSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function cleanupAudio() {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio = null;
  }
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return IDLE;
}

export function useTtsPlayback() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function stopTts() {
  generation += 1;
  abortController?.abort();
  abortController = null;
  cleanupAudio();
  cached = null;
  emit({ ...IDLE, rate: snapshot.rate });
}

async function playBlob(
  messageId: string,
  voice: GrokTtsVoice,
  blob: Blob,
  gen: number,
) {
  const url = URL.createObjectURL(blob);
  const next = new Audio(url);
  next.playbackRate = snapshot.rate;
  blobUrl = url;
  audio = next;

  next.onended = () => {
    if (gen === generation) stopTts();
  };
  next.onerror = () => {
    if (gen === generation) stopTts();
  };

  await next.play();
  if (gen !== generation) {
    next.pause();
    return;
  }

  emit({ messageId, status: "playing", rate: snapshot.rate, voice });
}

async function synthesizeAndPlay(
  messageId: string,
  text: string,
  voice: GrokTtsVoice,
  apiKey: string,
  gen: number,
) {
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;
  cleanupAudio();

  cached = { text, apiKey };

  const hit = getTtsAudio(voice, text);
  if (hit) {
    emit({ messageId, status: "loading", rate: snapshot.rate, voice });
    try {
      await playBlob(messageId, voice, hit, gen);
    } catch {
      if (gen === generation) stopTts();
    }
    return;
  }

  emit({ messageId, status: "loading", rate: snapshot.rate, voice });

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        voice,
        apiKey: apiKey.trim() || undefined,
      }),
    });

    if (gen !== generation) return;

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `TTS failed (${res.status})`);
    }

    const blob = await res.blob();
    if (gen !== generation) return;

    putTtsAudio(voice, text, blob);
    await playBlob(messageId, voice, blob, gen);
  } catch (err) {
    if (gen !== generation) return;
    if (err instanceof DOMException && err.name === "AbortError") return;
    stopTts();
  }
}

export async function playMessageTts(
  messageId: string,
  markdown: string,
  voice: GrokTtsVoice,
  apiKey: string,
) {
  const text = markdownToSpeechText(markdown);
  if (!text) return;

  const gen = ++generation;
  await synthesizeAndPlay(messageId, text, voice, apiKey, gen);
}

export function pauseTts() {
  if (!audio || snapshot.status !== "playing") return;
  audio.pause();
  emit({ ...snapshot, status: "paused" });
}

export function resumeTts() {
  if (!audio || snapshot.status !== "paused") return;
  void audio.play().then(() => {
    if (snapshot.status === "paused" && audio) {
      emit({ ...snapshot, status: "playing" });
    }
  });
}

export function togglePauseTts() {
  if (snapshot.status === "playing") pauseTts();
  else if (snapshot.status === "paused") resumeTts();
}

export function setTtsRate(rate: number) {
  const next = TTS_RATES.includes(rate as (typeof TTS_RATES)[number]) ? rate : 1;
  if (audio) audio.playbackRate = next;
  emit({ ...snapshot, rate: next });
}

export function cycleTtsRate() {
  const idx = TTS_RATES.indexOf(snapshot.rate as (typeof TTS_RATES)[number]);
  const next = TTS_RATES[(idx + 1) % TTS_RATES.length] ?? 1;
  setTtsRate(next);
}

export async function changeTtsVoice(voice: GrokTtsVoice) {
  if (!snapshot.messageId || !cached) {
    emit({ ...snapshot, voice });
    return;
  }
  if (snapshot.voice === voice && snapshot.status !== "idle") return;

  const { messageId } = snapshot;
  const { text, apiKey } = cached;
  const gen = ++generation;
  await synthesizeAndPlay(messageId, text, voice, apiKey, gen);
}

export function useMessageTts(messageId: string) {
  const playback = useTtsPlayback();
  const isActive = playback.messageId === messageId;
  const status: TtsStatus = isActive ? playback.status : "idle";

  const toggle = useCallback(
    async (markdown: string, voice: GrokTtsVoice, apiKey: string) => {
      if (isActive && status !== "idle") {
        stopTts();
        return;
      }
      await playMessageTts(messageId, markdown, voice, apiKey);
    },
    [isActive, messageId, status],
  );

  return { status, isActive, toggle };
}
