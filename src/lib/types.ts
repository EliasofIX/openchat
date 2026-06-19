// Shared types used across the app. Kept deliberately tiny — extend as needed.

export type Role = "user" | "assistant" | "system";

export type Message = {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  reasoningDurationMs?: number;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
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

export type UserSettings = {
  name: string;
  customInstructions: string;
  openRouterApiKey: string;
  model: string;
  reasoning: ReasoningSettings;
};
