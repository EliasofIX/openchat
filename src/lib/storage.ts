// Browser-only persistence helpers. We use localStorage so the app works
// out of the box without any backend. Swap these out for a database call
// (Postgres, SQLite, KV, …) when you wire up multi-user persistence.

import type { Conversation, UserSettings } from "./types";

const KEY_CONVERSATIONS = "openchat:conversations";
const KEY_SETTINGS = "openchat:settings";
const KEY_ACTIVE = "openchat:active-conversation";

export const DEFAULT_SETTINGS: UserSettings = {
  name: "",
  customInstructions: "",
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
};

const LEGACY_DEFAULT_TITLE_MODEL = "google/gemini-2.0-flash-001";

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
    provider,
    ollamaBaseUrl: stored.ollamaBaseUrl ?? DEFAULT_SETTINGS.ollamaBaseUrl,
    ollamaModel: stored.ollamaModel ?? DEFAULT_SETTINGS.ollamaModel,
    reasoning: {
      ...DEFAULT_SETTINGS.reasoning,
      ...stored.reasoning,
    },
    titleGeneration,
  };
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const storage = {
  loadConversations(): Conversation[] {
    if (typeof window === "undefined") return [];
    return safeParse<Conversation[]>(localStorage.getItem(KEY_CONVERSATIONS), []);
  },
  saveConversations(value: Conversation[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY_CONVERSATIONS, JSON.stringify(value));
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
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(value));
  },
  loadActiveId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(KEY_ACTIVE);
  },
  saveActiveId(id: string | null) {
    if (typeof window === "undefined") return;
    if (id) localStorage.setItem(KEY_ACTIVE, id);
    else localStorage.removeItem(KEY_ACTIVE);
  },
};
