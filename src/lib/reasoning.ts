// Helpers for extracting and formatting model reasoning from OpenRouter deltas.

type ReasoningDetail = {
  type?: string;
  text?: string;
  summary?: string;
  data?: string;
};

type ReasoningDelta = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: ReasoningDetail[];
};

const THINKING_TAG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["\x3cthink\x3e", "\x3c/think\x3e"],
  ["<think>", "</think>"],
];

function decodeOpenRouterReasoningData(data: string): string {
  const prefix = "openrouter.reasoning:";
  if (!data.startsWith(prefix)) return "";

  try {
    const json = JSON.parse(
      Buffer.from(data.slice(prefix.length), "base64").toString("utf8"),
    ) as { text?: string };
    return json.text ?? "";
  } catch {
    return "";
  }
}

function extractDetailText(entry: ReasoningDetail): string {
  if (entry.type === "reasoning.text" && entry.text) return entry.text;
  if (entry.type === "reasoning.summary" && entry.summary) return entry.summary;
  if (entry.type === "redacted_thinking" && entry.data) {
    return decodeOpenRouterReasoningData(entry.data);
  }
  if (entry.text) return entry.text;
  if (entry.summary) return entry.summary;
  if (entry.data) return decodeOpenRouterReasoningData(entry.data);
  return "";
}

export function extractReasoningText(delta: ReasoningDelta | undefined | null): string {
  if (!delta) return "";

  const direct = delta.reasoning ?? delta.reasoning_content;
  if (direct) return direct;

  const details = delta.reasoning_details;
  if (!details?.length) return "";

  return details.map(extractDetailText).join("");
}

export type ThinkingTagSplit = { reasoning: string; content: string };

// Pulls tagged thinking blocks out of a complete assistant string (Hermes 4, DeepHermes, …).
export function splitThinkingFromContent(text: string): ThinkingTagSplit {
  let reasoning = "";
  let content = text;

  for (const [open, close] of THINKING_TAG_PAIRS) {
    let safety = 0;
    while (safety++ < 32) {
      const start = content.indexOf(open);
      if (start === -1) break;
      const end = content.indexOf(close, start + open.length);
      if (end === -1) break;
      reasoning += content.slice(start + open.length, end);
      content = content.slice(0, start) + content.slice(end + close.length);
    }
  }

  return { reasoning, content };
}

// Splits Hermes / DeepHermes thinking tags that some models stream inside `content`.
export function createThinkingTagSplitter() {
  let carry = "";
  let inThinking = false;
  let closeTag = "";

  const partialSuffixLen = (text: string, needle: string) => {
    const max = Math.min(text.length, needle.length - 1);
    for (let len = max; len > 0; len--) {
      if (needle.startsWith(text.slice(-len))) return len;
    }
    return 0;
  };

  const push = (text: string): ThinkingTagSplit => {
    let reasoning = "";
    let content = "";
    carry += text;

    while (carry.length > 0) {
      if (!inThinking) {
        let earliest = -1;
        let openTag = "";
        let close = "";

        for (const [open, closeT] of THINKING_TAG_PAIRS) {
          const idx = carry.indexOf(open);
          if (idx !== -1 && (earliest === -1 || idx < earliest)) {
            earliest = idx;
            openTag = open;
            close = closeT;
          }
        }

        if (earliest === -1) {
          let hold = 0;
          for (const [open] of THINKING_TAG_PAIRS) {
            hold = Math.max(hold, partialSuffixLen(carry, open));
          }
          if (hold > 0) {
            content += carry.slice(0, -hold);
            carry = carry.slice(-hold);
          } else {
            content += carry;
            carry = "";
          }
          break;
        }

        content += carry.slice(0, earliest);
        carry = carry.slice(earliest + openTag.length);
        inThinking = true;
        closeTag = close;
        continue;
      }

      const idx = carry.indexOf(closeTag);
      if (idx === -1) {
        const hold = partialSuffixLen(carry, closeTag);
        reasoning += carry.slice(0, carry.length - hold);
        carry = carry.slice(carry.length - hold);
        break;
      }

      reasoning += carry.slice(0, idx);
      carry = carry.slice(idx + closeTag.length);
      inThinking = false;
      closeTag = "";
    }

    return { reasoning, content };
  };

  const flush = (): ThinkingTagSplit => {
    const rest = carry;
    carry = "";
    if (inThinking) return { reasoning: rest, content: "" };
    return { reasoning: "", content: rest };
  };

  return { push, flush };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
