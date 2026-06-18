// Shared types used across the app. Kept deliberately tiny — extend as needed.

export type Role = "user" | "assistant" | "system";

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

export type UserSettings = {
  name: string;
  customInstructions: string;
};
