// In-memory LRU cache for Grok TTS audio blobs.
// Keyed by voice + speech text so replaying the same reply skips a network round-trip.

import type { GrokTtsVoice } from "./types";

const MAX_ENTRIES = 24;

const cache = new Map<string, Blob>();

function cacheKey(voice: GrokTtsVoice, text: string) {
  return `${voice}\0${text}`;
}

export function getTtsAudio(voice: GrokTtsVoice, text: string): Blob | null {
  const key = cacheKey(voice, text);
  const blob = cache.get(key);
  if (!blob) return null;
  // Refresh LRU order.
  cache.delete(key);
  cache.set(key, blob);
  return blob;
}

export function putTtsAudio(voice: GrokTtsVoice, text: string, blob: Blob) {
  const key = cacheKey(voice, text);
  cache.delete(key);
  cache.set(key, blob);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
