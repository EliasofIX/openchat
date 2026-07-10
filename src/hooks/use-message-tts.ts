"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markdownToSpeechText } from "@/lib/tts";
import type { GrokTtsVoice } from "@/lib/types";

type TtsState = "idle" | "loading" | "playing";

let activeMessageId: string | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeBlobUrl: string | null = null;

function stopGlobalPlayback() {
  activeAudio?.pause();
  activeAudio = null;
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
  activeMessageId = null;
}

export function useMessageTts(messageId: string) {
  const [state, setState] = useState<TtsState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (activeMessageId === messageId) stopGlobalPlayback();
    audioRef.current = null;
    setState("idle");
  }, [messageId]);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    async (markdown: string, voice: GrokTtsVoice, apiKey: string) => {
      if (state === "playing" && activeMessageId === messageId) {
        stop();
        return;
      }

      const text = markdownToSpeechText(markdown);
      if (!text) return;

      stopGlobalPlayback();
      setState("loading");

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice,
            apiKey: apiKey.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `TTS failed (${res.status})`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        activeBlobUrl = url;
        activeAudio = audio;
        activeMessageId = messageId;
        audioRef.current = audio;

        audio.onended = () => {
          if (activeMessageId === messageId) stop();
        };
        audio.onerror = () => {
          if (activeMessageId === messageId) stop();
        };

        await audio.play();
        setState("playing");
      } catch {
        if (activeMessageId === messageId) stopGlobalPlayback();
        audioRef.current = null;
        setState("idle");
      }
    },
    [messageId, state, stop],
  );

  return { state, toggle, stop };
}
