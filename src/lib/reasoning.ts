// Helpers for extracting and formatting model reasoning from OpenRouter deltas.

type ReasoningDetail = {
  type?: string;
  text?: string;
  summary?: string;
};

type ReasoningDelta = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: ReasoningDetail[];
};

export function extractReasoningText(delta: ReasoningDelta | undefined | null): string {
  if (!delta) return "";

  const direct = delta.reasoning ?? delta.reasoning_content;
  if (direct) return direct;

  const details = delta.reasoning_details;
  if (!details?.length) return "";

  return details
    .map((entry) => {
      if (entry.type === "reasoning.text" && entry.text) return entry.text;
      if (entry.type === "reasoning.summary" && entry.summary) return entry.summary;
      return entry.text ?? entry.summary ?? "";
    })
    .join("");
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
