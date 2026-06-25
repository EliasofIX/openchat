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

// Untagged monologue before the answer — common when providers stream thinking in delta.content.
export function splitPlainReasoningFromContent(text: string): ThinkingTagSplit {
  const tagged = splitThinkingFromContent(text);
  if (tagged.reasoning) return tagged;

  const idx = text.indexOf("\n\n");
  if (idx >= 0) {
    const reasoning = text.slice(0, idx).trimEnd();
    const content = text.slice(idx + 2).trimStart();
    if (reasoning && content) return { reasoning, content };
  }

  return { reasoning: "", content: text };
}

// Words/phrases that mark text as model self-talk rather than user-facing
// answer. Tuned to be specific — "Let me" alone matches "Let me know" (a
// perfectly normal answer phrase), so we require a known meta verb after it.
const REASONING_META =
  /\b(the user|user said|user wants|user's|I need to|Let me (?:think|see|check|verify|figure|recall|reason|consider|review|first|just|use|try|make sure|start|begin|outline|draft|plan)|I should|Maybe I\b|I'll just|I will just|I don't (?:think|know|see|want)|check if|make sure (?:to|I|that)|my response|the answer (?:is|should|will|must|would)|the (?:format|response|reply) (?:is|should|will|must)|after thinking|let's go with|alright,?\s+(?:let|here|so|i|now|then)|here goes|here's (?:the|my) (?:answer|reply|response)|to summari[sz]e|in summary|should work|going to (?:say|reply|respond|answer|write))\b/i;

// Pulls a trailing user-facing answer out of a monologue. Walks backward
// through sentence boundaries (`. ` `! ` `? `) and remembers the longest
// contiguous trailing portion whose first sentence isn't model self-talk; if
// it crosses a meta sentence and then re-enters clean text, it stops — the
// answer must be one unbroken clean stretch at the end.
export function splitTrailingAnswerFromReasoning(text: string): ThinkingTagSplit {
  const trimmed = text.trimEnd();
  if (!trimmed) return { reasoning: "", content: "" };

  const MAX_CONTENT = 2000;
  let best: ThinkingTagSplit | null = null;
  let metaWall = false;

  for (let i = trimmed.length - 2; i >= 0; i--) {
    const ch = trimmed[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    if (trimmed[i + 1] !== " ") continue;

    const reasoning = trimmed.slice(0, i + 1).trimEnd();
    const content = trimmed.slice(i + 2).trimStart();
    if (!reasoning || !content) continue;
    if (content.length > MAX_CONTENT) break;

    const firstEndMatch = content.match(/^[\s\S]*?[.!?](?:\s|$)/);
    const firstSentence = firstEndMatch ? firstEndMatch[0] : content;

    if (REASONING_META.test(firstSentence)) {
      if (best) metaWall = true;
      continue;
    }
    if (metaWall) break;

    best = { reasoning, content };
  }

  return best ?? { reasoning: trimmed, content: "" };
}

function splitUntaggedMonologue(text: string): ThinkingTagSplit {
  const plain = splitPlainReasoningFromContent(text);
  if (plain.reasoning && plain.content) return plain;
  if (plain.content && !plain.reasoning) {
    const rescued = splitTrailingAnswerFromReasoning(plain.content);
    if (rescued.content) return rescued;
  }
  return plain;
}

// Reconcile streamed reasoning/content after the full assistant string is known.
//
// Two real-world messes this handles:
//   1) Providers (or `createPlainReasoningSplitter.flush`) stream the whole
//      monologue — final answer included — as reasoning, then emit the rescued
//      answer separately as content. The answer ends up duplicated in both
//      channels; strip the trailing copy from reasoning.
//   2) Models that leak their own self-talk into `delta.content` even when the
//      reasoning channel is active (e.g. "Alright, "X" should work. X"). When
//      the leak overlaps with the end of `reasoning`, use that as a signal to
//      keep just the real trailing answer in content.
export function reconcileReasoningAndContent(
  reasoning: string,
  content: string,
): ThinkingTagSplit {
  let r = reasoning.trim();
  let c = content.trim();

  if (!r && !c) return { reasoning: "", content: "" };
  if (!r) return splitUntaggedMonologue(c);
  if (!c) return splitUntaggedMonologue(r);
  if (r === c) return splitUntaggedMonologue(r);

  // (2) Leaky content channel — trust the rescued tail when either (a) the
  // duplicate already lives at the end of `reasoning`, or (b) the rescued
  // preamble is clearly model self-talk. Otherwise we'd over-trim a normal
  // multi-sentence answer.
  const tail = splitTrailingAnswerFromReasoning(c);
  if (tail.reasoning && tail.content) {
    const rEndsWithTail = r.endsWith(tail.content);
    const preambleIsMeta = REASONING_META.test(tail.reasoning);
    if (rEndsWithTail || preambleIsMeta) {
      c = tail.content;
      if (preambleIsMeta && !rEndsWithTail) {
        r = `${r}\n\n${tail.reasoning}`;
      }
    }
  }

  // (1) Drop the duplicate trailing answer that the streamer left in reasoning.
  if (r.endsWith(c)) {
    r = r.slice(0, r.length - c.length).trimEnd();
  }

  if (r && c) return { reasoning: r, content: c };
  if (r) return splitUntaggedMonologue(r);
  return splitUntaggedMonologue(c);
}

// Streams untagged reasoning that arrives in delta.content before the first blank line.
export function createPlainReasoningSplitter() {
  let carry = "";
  let inContent = false;
  let streamedBeforeDelimiter = "";

  const holdPartialDelimiter = (text: string): { emit: string; hold: string } => {
    const delimiter = "\n\n";
    for (let len = Math.min(text.length, delimiter.length - 1); len >= 1; len--) {
      const suffix = text.slice(-len);
      if (delimiter.startsWith(suffix)) {
        return { emit: text.slice(0, -len), hold: suffix };
      }
    }
    return { emit: text, hold: "" };
  };

  const push = (text: string): ThinkingTagSplit => {
    if (inContent) return { reasoning: "", content: text };

    let reasoning = "";
    let content = "";
    carry += text;

    while (carry.length > 0) {
      const idx = carry.indexOf("\n\n");
      if (idx !== -1) {
        reasoning += carry.slice(0, idx);
        carry = carry.slice(idx + 2);
        inContent = true;
        content += carry;
        carry = "";
        break;
      }

      const { emit, hold } = holdPartialDelimiter(carry);
      reasoning += emit;
      carry = hold;
      break;
    }

    streamedBeforeDelimiter += reasoning;
    return { reasoning, content };
  };

  const flush = (): ThinkingTagSplit => {
    if (inContent) {
      const content = carry;
      carry = "";
      return { reasoning: "", content };
    }

    const full = streamedBeforeDelimiter + carry;
    streamedBeforeDelimiter = "";
    carry = "";
    if (!full) return { reasoning: "", content: "" };

    // Reasoning before the delimiter was already streamed; only rescue the answer.
    const split = splitUntaggedMonologue(full);
    return { reasoning: "", content: split.content };
  };

  return { push, flush };
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
