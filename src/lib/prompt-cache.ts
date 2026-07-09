// ─────────────────────────────────────────────────────────────────────────────
// prompt-cache — OpenRouter input (prompt) token caching helpers.
//
// Applies session_id sticky routing, Anthropic automatic cache_control, and
// explicit per-block breakpoints for large attachments on providers that
// require them (Gemini, Qwen, Alibaba). Dynamic memory context lives in a
// separate user message (see system-prompt.ts), not in the system message.
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
  belowMinimum?: boolean;
  minTokens?: number;
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

export function resolvePromptCachingMode(
  model: string,
  capabilitiesMode?: PromptCachingMode,
): PromptCachingMode {
  if (capabilitiesMode && capabilitiesMode !== "none") return capabilitiesMode;
  return promptCachingModeForModel(model);
}

/**
 * Sticky-routing session key for OpenRouter. Omit when there is no conversation
 * yet — never stringify a null id into `"null:<model>"`.
 */
export function buildCacheSessionId(
  conversationId: string | null | undefined,
  model: string,
): string | undefined {
  const id = conversationId?.trim();
  if (!id) return undefined;
  return `${id}:${model.trim().toLowerCase()}`;
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

function systemMessageWithBreakpoint(
  message: ChatMessage,
  cacheControl: CacheControl,
  minChars: number,
): ChatMessage {
  if (message.role !== "system" || typeof message.content !== "string") {
    return message;
  }

  const trimmed = message.content.trim();
  if (!trimmed || trimmed.length < minChars) return message;

  return { ...message, content: [textPart(trimmed, cacheControl)] };
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
  mode: PromptCachingMode,
): ChatMessage[] {
  let breakpoints = 0;

  return messages.map((message, index) => {
    if (breakpoints >= MAX_EXPLICIT_BREAKPOINTS) return message;

    // Anthropic auto mode uses top-level cache_control — reserve explicit slots
    // for large attachments only.
    if (
      mode === "explicit" &&
      message.role === "system" &&
      index === 0 &&
      typeof message.content === "string"
    ) {
      const next = systemMessageWithBreakpoint(message, cacheControl, minChars);
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
  cachingMode?: PromptCachingMode;
}): ApplyPromptCacheResult | null {
  const { provider, model, messages, settings, sessionId, tools, cachingMode } =
    input;

  if (!shouldEnablePromptCache(provider, settings)) return null;

  const mode = resolvePromptCachingMode(model, cachingMode);
  if (mode === "none") return null;

  const cacheControl = buildCacheControl(settings?.ttl ?? "5m");
  const minTokens = minCacheableTokens(model);
  const minChars = minTokens * CHARS_PER_TOKEN;

  const totalChars =
    messages.reduce((sum, m) => sum + textLength(m.content), 0) +
    (tools?.reduce((sum, t) => sum + JSON.stringify(t).length, 0) ?? 0);

  const belowMinimum = estimateTokens(totalChars) < minTokens;
  const base: ApplyPromptCacheResult = {
    messages,
    session_id: sessionId?.trim() || undefined,
    stream_options: { include_usage: true },
    belowMinimum,
    minTokens,
  };

  if (belowMinimum) return base;

  let nextMessages = messages;

  if (mode === "explicit" || mode === "auto") {
    nextMessages = addExplicitBreakpoints(messages, cacheControl, minChars, mode);
  }

  const result: ApplyPromptCacheResult = {
    ...base,
    messages: nextMessages,
    belowMinimum: false,
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
