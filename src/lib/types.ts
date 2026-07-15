// Shared types used across the app. Kept deliberately tiny — extend as needed.

export type Role = "user" | "assistant" | "system";

export type AttachmentKind = "image" | "pdf" | "code";

export type MessageAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  dataUrl?: string;
  textContent?: string;
};

export type PendingAttachment = MessageAttachment & {
  status: "compressing" | "processing" | "ready" | "unsupported" | "error";
  errorMessage?: string;
  previewUrl?: string;
};

export type MemoryNoticeStatus =
  | "saved"
  | "duplicate"
  | "full"
  | "storage_failed"
  | "tool_round_limit";

export type MemoryNotice = {
  status: MemoryNoticeStatus;
  /** Saved fact text; omitted when memory is full. */
  content?: string;
};

/** Web search hit shown under an assistant reply and mapped to [n] citations. */
export type MessageSource = {
  /** 1-based index matching [n] citations in content. */
  index: number;
  title: string;
  url: string;
  snippet?: string;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  attachments?: MessageAttachment[];
  reasoning?: string;
  reasoningDurationMs?: number;
  memoryNotice?: MemoryNotice;
  /** Sources from web_search tool rounds for this assistant reply. */
  sources?: MessageSource[];
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Set after the first AI-generated title is applied. */
  aiTitleGenerated?: boolean;
};

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ReasoningSettings = {
  enabled: boolean;
  effort: ReasoningEffort;
  showInResponse: boolean;
  collapseByDefault: boolean;
};

export type ModelProvider = "openrouter" | "ollama";

export type TitleGenerationSettings = {
  enabled: boolean;
  provider: ModelProvider;
  model: string;
};

export type MemorySource = "user" | "agent";

export type Memory = {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  source: MemorySource;
};

export type MemorySettings = {
  enabled: boolean;
};

export type WebSearchSettings = {
  enabled: boolean;
};

export type PromptCachingSettings = {
  enabled: boolean;
  /** Provider cache TTL — 5 minutes (default) or 1 hour (higher write cost). */
  ttl: "5m" | "1h";
};

export type GrokTtsVoice = "eve" | "ara" | "rex" | "sal" | "leo";

export type TtsSettings = {
  voice: GrokTtsVoice;
};

/** Tool names the client can execute and the chat route may attach. */
export type ChatToolName = "save_memory" | "web_search";

export type UserSettings = {
  name: string;
  customInstructions: string;
  /** oklch CSS color string, or null for the default neutral palette. */
  colorAccent: string | null;
  provider: ModelProvider;
  openRouterApiKey: string;
  model: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  reasoning: ReasoningSettings;
  titleGeneration: TitleGenerationSettings;
  memory: MemorySettings;
  webSearch: WebSearchSettings;
  promptCaching: PromptCachingSettings;
  /** When true, OpenRouter requests only route to Zero Data Retention endpoints. */
  zdrOnly: boolean;
  tts: TtsSettings;
};
