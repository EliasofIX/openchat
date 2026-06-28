// Hydrate attachment refs from IndexedDB for display and API requests.

import { getBlob } from "@/lib/attachment-store";
import type { Message, MessageAttachment } from "@/lib/types";

function attachmentPayloadMissing(att: MessageAttachment): boolean {
  if (att.kind === "image") return !att.dataUrl;
  if (att.kind === "code" || att.kind === "pdf") return !att.textContent;
  return false;
}

export function findMissingAttachmentNames(messages: Message[]): string[] {
  const names: string[] = [];
  for (const message of messages) {
    for (const att of message.attachments ?? []) {
      if (attachmentPayloadMissing(att)) names.push(att.name);
    }
  }
  return names;
}

export async function hydrateAttachment(att: MessageAttachment): Promise<MessageAttachment> {
  if (att.dataUrl || att.textContent) return att;
  const blob = await getBlob(att.id);
  if (!blob) return att;
  return { ...att, ...blob };
}

export async function hydrateMessage(message: Message): Promise<Message> {
  if (!message.attachments?.length) return message;
  const attachments = await Promise.all(message.attachments.map(hydrateAttachment));
  return { ...message, attachments };
}

export async function hydrateMessages(messages: Message[]): Promise<Message[]> {
  return Promise.all(messages.map(hydrateMessage));
}
