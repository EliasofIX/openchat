// ─────────────────────────────────────────────────────────────────────────────
// estimate-context — approximate token usage for the chat context window meter.
// Mirrors the API message shape (system prompt + hydrated messages + draft).
// Uses a chars/4 heuristic; images get a fixed conservative allowance.
// ─────────────────────────────────────────────────────────────────────────────

import { buildApiContent, type ContentPart } from "@/lib/build-api-content";
import type { Message, MessageAttachment } from "@/lib/types";

const CHARS_PER_TOKEN = 4;
const MESSAGE_OVERHEAD_TOKENS = 4;
const IMAGE_TOKEN_ALLOWANCE = 768;

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

function textTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function countContentParts(content: string | ContentPart[]): {
  text: number;
  images: number;
} {
  if (typeof content === "string") {
    return { text: textTokens(content), images: 0 };
  }

  let text = 0;
  let images = 0;
  for (const part of content) {
    if (part.type === "text") {
      text += textTokens(part.text);
    } else if (part.type === "image_url") {
      images += 1;
    }
  }
  return { text, images };
}

function messageToApiContent(m: Message): string | ContentPart[] {
  if (m.role === "user" && m.attachments?.length) {
    return buildApiContent(m.content, m.attachments);
  }
  return m.content;
}

function countMessage(m: Message): { text: number; images: number } {
  const content = countContentParts(messageToApiContent(m));
  const reasoning = m.reasoning ? textTokens(m.reasoning) : 0;
  return {
    text: content.text + reasoning + MESSAGE_OVERHEAD_TOKENS,
    images: content.images,
  };
}

function countDraft(
  draftText?: string,
  draftAttachments?: MessageAttachment[],
): { text: number; images: number } {
  const trimmed = draftText?.trim() ?? "";
  const hasAttachments = (draftAttachments?.length ?? 0) > 0;
  if (!trimmed && !hasAttachments) {
    return { text: 0, images: 0 };
  }

  const content = countContentParts(
    buildApiContent(trimmed, draftAttachments ?? []),
  );
  return {
    text: content.text + MESSAGE_OVERHEAD_TOKENS,
    images: content.images,
  };
}

export type ContextTokenBreakdown = {
  system: number;
  messages: number;
  draft: number;
  images: number;
  total: number;
};

export function estimateContextBreakdown(input: {
  systemPrompt?: string;
  messages: Message[];
  draftText?: string;
  draftAttachments?: MessageAttachment[];
}): ContextTokenBreakdown {
  const system = input.systemPrompt?.trim()
    ? textTokens(input.systemPrompt) + MESSAGE_OVERHEAD_TOKENS
    : 0;

  let messagesText = 0;
  let images = 0;
  for (const m of input.messages) {
    const counted = countMessage(m);
    messagesText += counted.text;
    images += counted.images;
  }

  const draft = countDraft(input.draftText, input.draftAttachments);
  images += draft.images;

  const total =
    system +
    messagesText +
    draft.text +
    images * IMAGE_TOKEN_ALLOWANCE;

  return {
    system,
    messages: messagesText,
    draft: draft.text,
    images: images * IMAGE_TOKEN_ALLOWANCE,
    total,
  };
}

export function estimateContextTokens(input: {
  systemPrompt?: string;
  messages: Message[];
  draftText?: string;
  draftAttachments?: MessageAttachment[];
}): number {
  return estimateContextBreakdown(input).total;
}
