"use client";

import { useMemo } from "react";
import {
  estimateContextBreakdown,
  type ContextTokenBreakdown,
} from "@/lib/estimate-context";
import type { PromptCacheUsage } from "@/lib/prompt-cache";
import type { Message, MessageAttachment } from "@/lib/types";

type Options = {
  messages: Message[];
  systemPrompt?: string;
  draftText?: string;
  draftAttachments?: MessageAttachment[];
  contextTokens: number | null;
  lastCacheUsage?: PromptCacheUsage | null;
};

export type ContextUsageState = {
  used: number;
  remaining: number | null;
  percent: number | null;
  limit: number | null;
  hasLimit: boolean;
  breakdown: ContextTokenBreakdown;
  lastCacheUsage: PromptCacheUsage | null;
};

export function useContextUsage(options: Options): ContextUsageState {
  const {
    messages,
    systemPrompt,
    draftText,
    draftAttachments,
    contextTokens,
    lastCacheUsage = null,
  } = options;

  return useMemo(() => {
    const breakdown = estimateContextBreakdown({
      systemPrompt,
      messages,
      draftText,
      draftAttachments,
    });
    const used = breakdown.total;
    const limit = contextTokens;
    const hasLimit = limit != null && limit > 0;
    const remaining = hasLimit ? Math.max(0, limit - used) : null;
    const percent = hasLimit ? Math.min(100, (used / limit) * 100) : null;

    return { used, remaining, percent, limit, hasLimit, breakdown, lastCacheUsage };
  }, [
    messages,
    systemPrompt,
    draftText,
    draftAttachments,
    contextTokens,
    lastCacheUsage,
  ]);
}
