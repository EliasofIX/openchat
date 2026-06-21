// Hydrate attachment refs from IndexedDB for display and API requests.

import { getBlob } from "@/lib/attachment-store";
import type { Message, MessageAttachment } from "@/lib/types";

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
