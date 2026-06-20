import type { MessageAttachment } from "./types";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export function buildApiContent(
  text: string,
  attachments: MessageAttachment[] = [],
): string | ContentPart[] {
  const textBlocks: string[] = [];
  const trimmed = text.trim();
  if (trimmed) textBlocks.push(trimmed);

  const imageParts: ContentPart[] = [];

  for (const att of attachments) {
    if (att.kind === "image" && att.dataUrl) {
      imageParts.push({ type: "image_url", image_url: { url: att.dataUrl } });
    } else if (att.kind === "code" && att.textContent) {
      const ext = att.name.includes(".") ? att.name.split(".").pop() ?? "" : "";
      textBlocks.push(
        `[Attached file: ${att.name}]\n\`\`\`${ext}\n${att.textContent}\n\`\`\``,
      );
    } else if (att.kind === "pdf" && att.textContent) {
      textBlocks.push(`[Attached PDF: ${att.name}]\n\n${att.textContent}`);
    }
  }

  const combined = textBlocks.join("\n\n");
  const parts: ContentPart[] = [];

  if (combined) parts.push({ type: "text", text: combined });
  parts.push(...imageParts);

  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}
