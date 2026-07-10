"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Pause, Play, X } from "@/components/icons";
import {
  changeTtsVoice,
  clearTtsError,
  cycleTtsRate,
  stopTts,
  togglePauseTts,
  useTtsPlayback,
} from "@/hooks/use-message-tts";
import {
  GROK_TTS_VOICE_HINTS,
  GROK_TTS_VOICE_LABELS,
  GROK_TTS_VOICES,
} from "@/lib/tts";
import type { GrokTtsVoice } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  voice: GrokTtsVoice;
  onVoiceChange: (voice: GrokTtsVoice) => void;
};

function formatRate(rate: number) {
  return `${rate}x`;
}

export function TtsNowPlaying({ voice, onVoiceChange }: Props) {
  const playback = useTtsPlayback();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!voiceOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setVoiceOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVoiceOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [voiceOpen]);

  if (playback.status === "idle" && playback.error) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 flex justify-center px-4">
        <div
          role="alert"
          className={cn(
            "pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl",
            "border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-lg",
          )}
        >
          <p className="min-w-0 flex-1 leading-snug">{playback.error}</p>
          <button
            type="button"
            onClick={clearTtsError}
            className="grid size-6 shrink-0 place-items-center rounded-full transition hover:bg-destructive/10"
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (playback.status === "idle") return null;

  const activeVoice = playback.voice ?? voice;
  const isLoading = playback.status === "loading";
  const isPaused = playback.status === "paused";

  const onSelectVoice = (next: GrokTtsVoice) => {
    setVoiceOpen(false);
    onVoiceChange(next);
    void changeTtsVoice(next);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 flex justify-center px-4">
      <div
        ref={rootRef}
        role="group"
        aria-label="Now playing"
        className={cn(
          "pointer-events-auto relative flex items-center gap-0.5 rounded-full",
          "border border-border bg-foreground px-1.5 py-1 text-background shadow-lg",
        )}
      >
        <button
          type="button"
          onClick={togglePauseTts}
          disabled={isLoading}
          className={cn(
            "grid size-8 place-items-center rounded-full transition",
            "hover:bg-background/15 disabled:opacity-50",
          )}
          aria-label={isPaused ? "Resume" : "Pause"}
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isPaused ? (
            <Play size={14} />
          ) : (
            <Pause size={14} />
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setVoiceOpen((o) => !o)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition",
              "hover:bg-background/15",
            )}
            aria-haspopup="listbox"
            aria-expanded={voiceOpen}
            aria-label="Voice"
          >
            {GROK_TTS_VOICE_LABELS[activeVoice]}
            <ChevronDown size={12} className="opacity-70" />
          </button>

          {voiceOpen && (
            <ul
              role="listbox"
              className={cn(
                "absolute bottom-[calc(100%+0.4rem)] left-1/2 z-40 min-w-[10.5rem] -translate-x-1/2",
                "overflow-hidden rounded-xl border border-border bg-card py-1 text-card-foreground shadow-lg",
              )}
            >
              {GROK_TTS_VOICES.map((v) => (
                <li key={v} role="option" aria-selected={v === activeVoice}>
                  <button
                    type="button"
                    onClick={() => onSelectVoice(v)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition",
                      "hover:bg-muted",
                      v === activeVoice && "bg-muted/70",
                    )}
                  >
                    <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center">
                      {v === activeVoice && <Check size={12} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{GROK_TTS_VOICE_LABELS[v]}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {GROK_TTS_VOICE_HINTS[v]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={cycleTtsRate}
          className={cn(
            "inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2.5 text-xs font-medium tabular-nums transition",
            "hover:bg-background/15",
          )}
          aria-label={`Playback speed ${formatRate(playback.rate)}. Click to change.`}
        >
          {formatRate(playback.rate)}
        </button>

        <button
          type="button"
          onClick={stopTts}
          className={cn(
            "grid size-8 place-items-center rounded-full transition",
            "hover:bg-background/15",
          )}
          aria-label="Stop read aloud"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
