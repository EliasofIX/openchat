// ─────────────────────────────────────────────────────────────────────────────
// prompt-cache — OpenRouter input (prompt) token caching helpers.
//
// Applies session_id sticky routing, Anthropic automatic cache_control, and
// explicit per-block breakpoints for large attachments / system prompts on
// providers that require them (Gemini, Qwen, Alibaba).
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatContentPart, ChatMessage, ChatToolDefinition } from "@/lib/ai-client";
import type { ModelProvider, PromptCachingSettings } from "@/lib/types";

export type CacheControl = { type: "ephemeral"; ttl?: "1h" };

export type PromptCachingMode = "auto" | "explicit" | "implicit" | "none";

export type PromptCacheUsage = {
  promptTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
};

export type ApplyPromptCacheResult = {
  messages: ChatMessage[];
  cache_control?: CacheControl;
  session_id?: string;
  stream_options: { include_usage: true };
};

const CHARS_PER_TOKEN = 4;
const ATTACHMENT_MARKER = /\[Attached (?:PDF|file):[^\]]+\]/;
const MAX_EXPLICIT_BREAKPOINTS = 4;
/** ~512 tokens — only mark large attachment bodies for explicit breakpoints. */
const ATTACHMENT_CACHE_MIN_CHARS = 512 * CHARS_PER_TOKEN;

export function promptCachingModeForModel(model: string): PromptCachingMode {
  const id = model.toLowerCase();
  if (!id) return "none";
  if (/anthropic\/|\/claude|claude-/.test(id)) return "auto";
  if (/qwen\/|alibaba\/|deepseek\/deepseek-v3\.2/.test(id)) return "explicit";
  if (
    /openai\/|\/gpt-|google\/gemini|grok\/|moonshotai\/|groq\/|deepseek\//
      .test(id)
  ) {
    return "implicit";
  }
  return "implicit";
}

export function isAnthropicModel(model: string): boolean {
  return promptCachingModeForModel(model) === "auto";
}

export function minCacheableTokens(model: string): number {
  const id = model.toLowerCase();
  if (/opus-4\.[5-9]|opus-4\.6|opus-4\.7|opus-4\.8|haiku-4\.5/.test(id)) {
    return 4096;
  }
  if (/haiku-3\.5/.test(id)) return 2048;
  if (/gemini-2\.5-pro/.test(id)) return 4096;
  if (/gemini-2\.5-flash/.test(id)) return 1024;
  return 1024;
}

export function shouldEnablePromptCache(
  provider: ModelProvider,
  settings?: PromptCachingSettings,
): boolean {
  return provider === "openrouter" && (settings?.enabled ?? true);
}

export function buildCacheControl(ttl: PromptCachingSettings["ttl"]): CacheControl {
  return ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
}

function textLength(content: string | ChatContentPart[] | null | undefined): number {
  if (!content) return 0;
  if (typeof content === "string") return content.length;
  return content.reduce((sum, part) => {
    if (part.type === "text") return sum + part.text.length;
    return sum;
  }, 0);
}

function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function textPart(text: string, cacheControl?: CacheControl): ChatContentPart {
  const part: ChatContentPart = { type: "text", text };
  if (cacheControl) part.cache_control = cacheControl;
  return part;
}

function splitSystemPrompt(content: string): { stable: string; dynamic: string } {
  const marker = "The following are things you should remember";
  const idx = content.indexOf(marker);
  if (idx === -1) return { stable: content, dynamic: "" };
  return {
    stable: content.slice(0, idx).trimEnd(),
    dynamic: content.slice(idx).trimStart(),
  };
}

function systemMessageWithBreakpoints(
  message: ChatMessage,
  cacheControl: CacheControl,
  minChars: number,
): ChatMessage {
  if (message.role !== "system" || typeof message.content !== "string") {
    return message;
  }

  const trimmed = message.content.trim();
  if (!trimmed || trimmed.length < minChars) return message;

  const { stable, dynamic } = splitSystemPrompt(trimmed);
  if (dynamic && stable.length >= minChars / 2) {
    const parts: ChatContentPart[] = [
      textPart(stable, cacheControl),
      textPart(dynamic),
    ];
    return { ...message, content: parts };
  }

  if (trimmed.length >= minChars) {
    return { ...message, content: [textPart(trimmed, cacheControl)] };
  }

  return message;
}

function splitAttachmentString(
  content: string,
  cacheControl: CacheControl,
): string | ChatContentPart[] {
  const match = ATTACHMENT_MARKER.exec(content);
  if (!match) return content;

  const markerStart = match.index;
  const before = content.slice(0, markerStart).trimEnd();
  const attachmentBody = content.slice(markerStart).trim();

  if (attachmentBody.length < ATTACHMENT_CACHE_MIN_CHARS) {
    return content;
  }

  const parts: ChatContentPart[] = [];
  if (before) parts.push(textPart(before));
  parts.push(textPart(attachmentBody, cacheControl));
  return parts;
}

function userContentWithBreakpoints(
  content: string | ChatContentPart[] | null | undefined,
  cacheControl: CacheControl,
): string | ChatContentPart[] | null | undefined {
  if (!content) return content;
  if (typeof content === "string") {
    return splitAttachmentString(content, cacheControl);
  }

  const next: ChatContentPart[] = [];
  let breakpoints = 0;

  for (const part of content) {
    if (part.type !== "text") {
      next.push(part);
      continue;
    }

    if (
      breakpoints < MAX_EXPLICIT_BREAKPOINTS &&
      part.text.length >= ATTACHMENT_CACHE_MIN_CHARS &&
      ATTACHMENT_MARKER.test(part.text)
    ) {
      const split = splitAttachmentString(part.text, cacheControl);
      if (Array.isArray(split)) {
        next.push(...split);
        breakpoints += 1;
        continue;
      }
    }

    next.push(part);
  }

  if (next.length === 1 && next[0].type === "text") return next[0].text;
  return next;
}

function addExplicitBreakpoints(
  messages: ChatMessage[],
  cacheControl: CacheControl,
  minChars: number,
): ChatMessage[] {
  let breakpoints = 0;

  return messages.map((message, index) => {
    if (breakpoints >= MAX_EXPLICIT_BREAKPOINTS) return message;

    if (message.role === "system" && index === 0 && typeof message.content === "string") {
      const next = systemMessageWithBreakpoints(message, cacheControl, minChars);
      if (next.content !== message.content) breakpoints += 1;
      return next;
    }

    if (message.role === "user") {
      const nextContent = userContentWithBreakpoints(message.content, cacheControl);
      if (nextContent !== message.content) breakpoints += 1;
      return { ...message, content: nextContent };
    }

    return message;
  });
}

export function applyPromptCache(input: {
  provider: ModelProvider;
  model: string;
  messages: ChatMessage[];
  settings?: PromptCachingSettings;
  sessionId?: string;
  tools?: ChatToolDefinition[];
}): ApplyPromptCacheResult | null {
  const { provider, model, messages, settings, sessionId, tools } = input;

  if (!shouldEnablePromptCache(provider, settings)) return null;

  const mode = promptCachingModeForModel(model);
  if (mode === "none") return null;

  const cacheControl = buildCacheControl(settings?.ttl ?? "5m");
  const minChars = minCacheableTokens(model) * CHARS_PER_TOKEN;

  const totalChars =
    messages.reduce((sum, m) => sum + textLength(m.content), 0) +
    (tools?.reduce((sum, t) => sum + JSON.stringify(t).length, 0) ?? 0);

  if (estimateTokens(totalChars) < minCacheableTokens(model)) {
    return {
      messages,
      session_id: sessionId?.trim() || undefined,
      stream_options: { include_usage: true },
    };
  }

  let nextMessages = messages;

  if (mode === "explicit" || mode === "auto") {
    nextMessages = addExplicitBreakpoints(messages, cacheControl, minChars);
  }

  const result: ApplyPromptCacheResult = {
    messages: nextMessages,
    session_id: sessionId?.trim() || undefined,
    stream_options: { include_usage: true },
  };

  if (mode === "auto") {
    result.cache_control = cacheControl;
  }

  return result;
}

export function parseCacheUsage(usage: unknown): PromptCacheUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as {
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
    };
  };

  const promptTokens = u.prompt_tokens;
  if (typeof promptTokens !== "number") return null;

  const details = u.prompt_tokens_details;
  return {
    promptTokens,
    cachedTokens:
      typeof details?.cached_tokens === "number" ? details.cached_tokens : 0,
    cacheWriteTokens:
      typeof details?.cache_write_tokens === "number"
        ? details.cache_write_tokens
        : 0,
  };
}
