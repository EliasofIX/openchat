import type { Message, UserSettings } from "@/lib/types";
import { getOllamaBaseUrl, getOpenRouterApiKey, getTitleModel } from "@/lib/providers";

export function deriveFallbackTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";

  const text = first.content.trim().replace(/\s+/g, " ");
  if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;

  const att = first.attachments?.[0];
  if (att) {
    const label =
      att.kind === "image" ? "Image" : att.kind === "pdf" ? "PDF" : att.name;
    return label.length > 60 ? `${label.slice(0, 60)}…` : label;
  }

  return "New chat";
}

export function shouldGenerateAiTitle(
  messages: Message[],
  aiTitleGenerated?: boolean,
  enabled = true,
): boolean {
  if (!enabled || aiTitleGenerated) return false;
  const userCount = messages.filter((m) => m.role === "user").length;
  const assistantCount = messages.filter(
    (m) => m.role === "assistant" && m.content.trim(),
  ).length;
  return userCount >= 1 && assistantCount >= 1;
}

function formatMessagesForTitle(messages: Message[]): string {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const text = m.content.trim().slice(0, 500);
      return `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
    })
    .join("\n\n");
}

function sanitizeTitle(raw: string): string {
  let title = raw.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/[.!?]+$/, "");
  title = title.replace(/\s+/g, " ").trim();
  if (title.length > 80) title = `${title.slice(0, 77)}…`;
  return title || "New chat";
}

export async function generateChatTitle(
  messages: Message[],
  settings: UserSettings,
): Promise<string> {
  const payload = {
    messages: formatMessagesForTitle(messages),
    provider: settings.titleGeneration.provider,
    model: getTitleModel(settings),
    apiKey: getOpenRouterApiKey(settings) || undefined,
    ollamaBaseUrl: getOllamaBaseUrl(settings),
  };

  const res = await fetch("/api/generate-title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Title generation failed (${res.status})`);
  }

  const data = (await res.json()) as { title: string };
  return sanitizeTitle(data.title);
}
