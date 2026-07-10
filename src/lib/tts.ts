// Grok Voice TTS helpers — voice list, labels, and plain-text prep for speech.

import type { GrokTtsVoice } from "./types";

export const GROK_TTS_MODEL = "x-ai/grok-voice-tts-1.0";

/** Grok Voice TTS accepts up to 15k characters per request. */
export const GROK_TTS_MAX_CHARS = 15_000;

export const GROK_TTS_VOICES: GrokTtsVoice[] = ["eve", "ara", "rex", "sal", "leo"];

export const GROK_TTS_VOICE_LABELS: Record<GrokTtsVoice, string> = {
  eve: "Eve",
  ara: "Ara",
  rex: "Rex",
  sal: "Sal",
  leo: "Leo",
};

export const GROK_TTS_VOICE_HINTS: Record<GrokTtsVoice, string> = {
  eve: "Energetic, upbeat",
  ara: "Warm, friendly",
  rex: "Confident, clear",
  sal: "Smooth, balanced",
  leo: "Authoritative, strong",
};

export function isGrokTtsVoice(value: string): value is GrokTtsVoice {
  return (GROK_TTS_VOICES as string[]).includes(value);
}

export type TtsValidationResult =
  | { ok: true; text: string; voice: GrokTtsVoice }
  | { ok: false; status: number; message: string };

/** Shared request checks for `/api/tts` (and unit tests). */
export function validateTtsRequest(body: {
  text?: string;
  voice?: string;
}): TtsValidationResult {
  const text = body.text?.trim();
  if (!text) {
    return { ok: false, status: 400, message: "`text` must be a non-empty string." };
  }
  if (text.length > GROK_TTS_MAX_CHARS) {
    return {
      ok: false,
      status: 400,
      message: `Text exceeds the ${GROK_TTS_MAX_CHARS.toLocaleString()} character limit.`,
    };
  }
  const voice = body.voice ?? "eve";
  if (!isGrokTtsVoice(voice)) {
    return { ok: false, status: 400, message: `Unsupported voice "${voice}".` };
  }
  return { ok: true, text, voice };
}

/** Strip common markdown so TTS reads natural speech, not punctuation artifacts. */
export function markdownToSpeechText(markdown: string): string {
  let text = markdown.trim();
  if (!text) return "";

  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > GROK_TTS_MAX_CHARS) {
    return `${text.slice(0, GROK_TTS_MAX_CHARS - 1)}…`;
  }
  return text;
}
