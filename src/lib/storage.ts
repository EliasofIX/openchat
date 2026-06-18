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
};

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
    return safeParse<UserSettings>(
      localStorage.getItem(KEY_SETTINGS),
      DEFAULT_SETTINGS,
    );
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
