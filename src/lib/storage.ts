// Browser-only persistence helpers. Conversation metadata lives in localStorage
// (per-conversation keys); large attachment blobs live in IndexedDB via
// attachment-store.ts.

import {
  collectAttachmentIds,
  deleteBlobs,
  putBlobsFromMessages,
} from "@/lib/attachment-store";
import type { Conversation, Memory, Message, MessageAttachment, UserSettings } from "./types";
import { isGrokTtsVoice } from "./tts";

const KEY_LEGACY_CONVERSATIONS = "openchat:conversations";
const KEY_CONV_INDEX = "openchat:conv-index";
const KEY_CONV_PREFIX = "openchat:conv:";
const KEY_SETTINGS = "openchat:settings";
const KEY_ACTIVE = "openchat:active-conversation";
const KEY_SIDEBAR_OPEN = "openchat:sidebar-open";
export const KEY_MEMORIES = "openchat:memories";

export const MAX_MEMORIES = 50;

/** When over cap, evict agent-saved entries before user entries. */
export function capMemories(memories: Memory[]): Memory[] {
  if (memories.length <= MAX_MEMORIES) return memories;

  const sorted = [...memories].sort((a, b) => b.updatedAt - a.updatedAt);
  const overflow = sorted.slice(MAX_MEMORIES);
  const autoEvicted = overflow
    .filter((m) => m.source === "agent")
    .map((m) => m.id);
  if (autoEvicted.length === 0) return sorted.slice(0, MAX_MEMORIES);

  return sorted.filter((m) => !autoEvicted.includes(m.id)).slice(0, MAX_MEMORIES);
}

export type StorageError = "quota_exceeded";

type ConvIndexEntry = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  aiTitleGenerated?: boolean;
};

let storageError: StorageError | null = null;
const errorListeners = new Set<(error: StorageError | null) => void>();

function setStorageError(error: StorageError | null) {
  storageError = error;
  for (const listener of errorListeners) listener(error);
}

export function getStorageError(): StorageError | null {
  return storageError;
}

export function clearStorageError() {
  setStorageError(null);
}

export function onStorageError(listener: (error: StorageError | null) => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export const DEFAULT_SETTINGS: UserSettings = {
  name: "",
  customInstructions: "",
  colorAccent: null,
  provider: "openrouter",
  openRouterApiKey: "",
  model: "",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "",
  reasoning: {
    enabled: false,
    effort: "medium",
    showInResponse: true,
    collapseByDefault: true,
  },
  titleGeneration: {
    enabled: true,
    provider: "openrouter",
    model: "",
  },
  memory: {
    enabled: true,
  },
  promptCaching: {
    enabled: true,
    ttl: "5m",
  },
  zdrOnly: false,
  tts: {
    voice: "eve",
  },
};

const LEGACY_DEFAULT_TITLE_MODEL = "google/gemini-2.0-flash-001";

function convKey(id: string) {
  return `${KEY_CONV_PREFIX}${id}`;
}

function resolveStoredTitleModel(
  titleStored: Partial<UserSettings["titleGeneration"]> | undefined,
  provider: UserSettings["provider"],
  stored: Partial<UserSettings>,
): string {
  const storedTitle = titleStored?.model?.trim() ?? "";
  const chatModel =
    provider === "ollama"
      ? (stored.ollamaModel?.trim() ?? "")
      : (stored.model?.trim() ?? "");

  if (!storedTitle || storedTitle === LEGACY_DEFAULT_TITLE_MODEL) {
    return chatModel;
  }
  return storedTitle;
}

function normalizeSettings(stored: Partial<UserSettings>): UserSettings {
  const provider = stored.provider ?? DEFAULT_SETTINGS.provider;
  const titleStored = stored.titleGeneration;

  const titleGeneration: UserSettings["titleGeneration"] = {
    enabled: titleStored?.enabled ?? DEFAULT_SETTINGS.titleGeneration.enabled,
    provider: titleStored?.provider ?? provider,
    model: resolveStoredTitleModel(titleStored, provider, stored),
  };

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    colorAccent: stored.colorAccent ?? DEFAULT_SETTINGS.colorAccent,
    provider,
    ollamaBaseUrl: stored.ollamaBaseUrl ?? DEFAULT_SETTINGS.ollamaBaseUrl,
    ollamaModel: stored.ollamaModel ?? DEFAULT_SETTINGS.ollamaModel,
    reasoning: {
      ...DEFAULT_SETTINGS.reasoning,
      ...stored.reasoning,
    },
    titleGeneration,
    memory: {
      ...DEFAULT_SETTINGS.memory,
      ...stored.memory,
    },
    promptCaching: {
      ...DEFAULT_SETTINGS.promptCaching,
      ...stored.promptCaching,
    },
    zdrOnly: stored.zdrOnly ?? DEFAULT_SETTINGS.zdrOnly,
    tts: {
      ...DEFAULT_SETTINGS.tts,
      ...stored.tts,
      voice:
        stored.tts?.voice && isGrokTtsVoice(stored.tts.voice)
          ? stored.tts.voice
          : DEFAULT_SETTINGS.tts.voice,
    },
  };
}

function normalizeMemories(raw: unknown): Memory[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw
    .filter(
      (item): item is Memory =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Memory).id === "string" &&
        typeof (item as Memory).content === "string",
    )
    .map((item) => ({
      id: item.id,
      content: item.content.trim().slice(0, 500),
      createdAt: item.createdAt ?? Date.now(),
      updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
      source: (item.source === "user" ? "user" : "agent") as Memory["source"],
    }))
    .filter((item) => item.content.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return capMemories(parsed);
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetItem(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    setStorageError(null);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      setStorageError("quota_exceeded");
    }
    return false;
  }
}

function stripAttachment(att: MessageAttachment): MessageAttachment {
  const { id, kind, name, mimeType } = att;
  return { id, kind, name, mimeType };
}

export function stripMessageForStorage(message: Message): Message {
  if (!message.attachments?.length) return message;
  return { ...message, attachments: message.attachments.map(stripAttachment) };
}

function stripConversation(conv: Conversation): Conversation {
  return { ...conv, messages: conv.messages.map(stripMessageForStorage) };
}

function loadIndex(): ConvIndexEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse<ConvIndexEntry[]>(localStorage.getItem(KEY_CONV_INDEX), []);
}

function saveIndex(index: ConvIndexEntry[]) {
  safeSetItem(KEY_CONV_INDEX, JSON.stringify(index));
}

function loadConversationById(id: string): Conversation | null {
  if (typeof window === "undefined") return null;
  return safeParse<Conversation | null>(localStorage.getItem(convKey(id)), null);
}

async function migrateLegacyConversations(): Promise<void> {
  if (typeof window === "undefined") return;
  const legacy = localStorage.getItem(KEY_LEGACY_CONVERSATIONS);
  if (!legacy) return;

  const conversations = safeParse<Conversation[]>(legacy, []);
  await putBlobsFromMessages(conversations.flatMap((c) => c.messages));

  const index: ConvIndexEntry[] = [];
  for (const conv of conversations) {
    safeSetItem(convKey(conv.id), JSON.stringify(stripConversation(conv)));
    index.push({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      aiTitleGenerated: conv.aiTitleGenerated,
    });
  }

  saveIndex(index.sort((a, b) => b.updatedAt - a.updatedAt));
  localStorage.removeItem(KEY_LEGACY_CONVERSATIONS);
}

function pruneOldestConversation(): boolean {
  const index = loadIndex();
  if (index.length === 0) return false;

  const oldest = index.reduce((a, b) => (a.updatedAt < b.updatedAt ? a : b));
  void storage.deleteConversation(oldest.id);
  return true;
}

export const storage = {
  async migrateIfNeeded(): Promise<void> {
    await migrateLegacyConversations();
  },

  loadConversations(): Conversation[] {
    if (typeof window === "undefined") return [];
    const index = loadIndex();
    const conversations = index
      .map((entry) => loadConversationById(entry.id))
      .filter((c): c is Conversation => c !== null);
    return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async saveConversation(conv: Conversation): Promise<boolean> {
    if (typeof window === "undefined") return false;

    await putBlobsFromMessages(conv.messages);
    const stripped = stripConversation(conv);

    let ok = safeSetItem(convKey(conv.id), JSON.stringify(stripped));
    if (!ok && pruneOldestConversation()) {
      ok = safeSetItem(convKey(conv.id), JSON.stringify(stripped));
    }
    if (!ok) return false;

    const index = loadIndex().filter((e) => e.id !== conv.id);
    index.unshift({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      aiTitleGenerated: conv.aiTitleGenerated,
    });
    saveIndex(index);
    return true;
  },

  async deleteConversation(id: string): Promise<void> {
    if (typeof window === "undefined") return;

    const conv = loadConversationById(id);
    if (conv) {
      await deleteBlobs(collectAttachmentIds(conv.messages));
    }

    localStorage.removeItem(convKey(id));
    saveIndex(loadIndex().filter((e) => e.id !== id));
  },

  loadSettings(): UserSettings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    const stored = safeParse<Partial<UserSettings>>(
      localStorage.getItem(KEY_SETTINGS),
      {},
    );
    return normalizeSettings(stored);
  },

  saveSettings(value: UserSettings) {
    if (typeof window === "undefined") return;
    safeSetItem(KEY_SETTINGS, JSON.stringify(value));
  },

  loadActiveId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(KEY_ACTIVE);
  },

  saveActiveId(id: string | null) {
    if (typeof window === "undefined") return;
    if (id) safeSetItem(KEY_ACTIVE, id);
    else localStorage.removeItem(KEY_ACTIVE);
  },

  loadSidebarOpen(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY_SIDEBAR_OPEN) === "1";
  },

  saveSidebarOpen(open: boolean) {
    if (typeof window === "undefined") return;
    safeSetItem(KEY_SIDEBAR_OPEN, open ? "1" : "0");
  },

  loadMemories(): Memory[] {
    if (typeof window === "undefined") return [];
    return normalizeMemories(safeParse<unknown>(localStorage.getItem(KEY_MEMORIES), []));
  },

  saveMemories(memories: Memory[]): boolean {
    if (typeof window === "undefined") return false;
    return safeSetItem(KEY_MEMORIES, JSON.stringify(normalizeMemories(memories)));
  },
};
