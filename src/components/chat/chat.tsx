"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, SquarePen } from "@/components/icons";
import { ChatComposer } from "./chat-composer";
import { MessageItem } from "./message";
import type { SettingsTab } from "./settings-dialog";
import { useChat } from "@/hooks/use-chat";
import { useAttachments } from "@/hooks/use-attachments";
import { useLowPower } from "@/hooks/use-low-power";
import { useModelCapabilities } from "@/hooks/use-model-capabilities";
import { useConversations } from "@/hooks/use-conversations";
import { useColorAccent } from "@/hooks/use-color-accent";
import { buildSystemPrompt, useSettings } from "@/hooks/use-settings";
import { LOAD_MORE_MESSAGE_STEP, VISIBLE_MESSAGE_LIMIT } from "@/lib/constants";
import { getActiveModel } from "@/lib/providers";
import { clearStorageError, getStorageError, onStorageError } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/lib/types";

const SettingsDialog = dynamic(
  () => import("./settings-dialog").then((m) => m.SettingsDialog),
  { ssr: false },
);

const Sidebar = dynamic(
  () => import("./sidebar").then((m) => m.Sidebar),
  { ssr: false },
);

export function Chat() {
  useLowPower();

  const conv = useConversations();
  const settingsHook = useSettings();
  useColorAccent(settingsHook.settings.colorAccent, settingsHook.hydrated);
  const systemPrompt = buildSystemPrompt(settingsHook.settings);
  const settingsRef = useRef(settingsHook.settings);
  const convRef = useRef(conv);
  const lastUpsertRef = useRef<{ id: string; aiTitleGenerated: boolean } | null>(null);

  useEffect(() => {
    settingsRef.current = settingsHook.settings;
  }, [settingsHook.settings]);

  useEffect(() => {
    convRef.current = conv;
  }, [conv]);

  const chat = useChat({
    systemPrompt,
    provider: settingsHook.settings.provider,
    model: getActiveModel(settingsHook.settings),
    apiKey: settingsHook.settings.openRouterApiKey,
    ollamaBaseUrl: settingsHook.settings.ollamaBaseUrl,
    reasoning: settingsHook.settings.reasoning,
    onFinish: (_msg, all) => {
      const saved = lastUpsertRef.current;
      void convRef.current.maybeGenerateTitle(
        saved?.id ?? null,
        all,
        settingsRef.current,
      );
    },
    onMessagesChange: (msgs) => {
      lastUpsertRef.current = convRef.current.upsertActive(msgs);
    },
  });

  const activeModel = getActiveModel(settingsHook.settings);
  const modelCapabilities = useModelCapabilities({
    provider: settingsHook.settings.provider,
    model: activeModel,
    apiKey: settingsHook.settings.openRouterApiKey,
    ollamaBaseUrl: settingsHook.settings.ollamaBaseUrl,
  });
  const attachmentsHook = useAttachments(
    activeModel,
    modelCapabilities.capabilities,
    modelCapabilities.loading,
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_MESSAGE_LIMIT);
  const [storageError, setStorageError] = useState(getStorageError());
  const [composerReset, setComposerReset] = useState(0);

  const lastLoadedId = useRef<string | null>(null);
  const setMessages = chat.setMessages;

  useEffect(() => onStorageError(setStorageError), []);

  useEffect(() => {
    if (sidebarOpen) setSidebarMounted(true);
  }, [sidebarOpen]);

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  useEffect(() => {
    if (!conv.hydrated) return;
    const id = conv.activeId ?? null;
    if (id !== lastLoadedId.current) {
      lastLoadedId.current = id;
      const active = conv.conversations.find((c) => c.id === id);
      setMessages(active?.messages ?? []);
      setVisibleCount(VISIBLE_MESSAGE_LIMIT);
    }
  }, [conv.hydrated, conv.activeId, conv.conversations, setMessages]);

  const hiddenCount = Math.max(0, chat.messages.length - visibleCount);
  const visibleMessages =
    hiddenCount > 0 ? chat.messages.slice(-visibleCount) : chat.messages;

  const onSend = (text: string, files: MessageAttachment[]) => {
    chat.send(text, files);
  };

  const newChat = () => {
    chat.setMessages([]);
    conv.createNew();
    lastUpsertRef.current = null;
    attachmentsHook.clear();
    setComposerReset((n) => n + 1);
    setSidebarOpen(false);
    setVisibleCount(VISIBLE_MESSAGE_LIMIT);
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground">
      {sidebarMounted && (
        <Sidebar
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          conversations={conv.conversations}
          activeId={conv.activeId}
          onSelect={(id) => conv.select(id)}
          onDelete={conv.remove}
          onOpenSettings={() => {
            setSidebarOpen(false);
            openSettings("general");
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settingsHook.settings}
          onSave={settingsHook.update}
          initialTab={settingsTab}
        />
      )}

      {storageError === "quota_exceeded" && (
        <div className="absolute inset-x-0 top-12 z-30 mx-auto max-w-3xl px-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>Storage is full. Oldest conversations may have been removed.</span>
            <button
              type="button"
              onClick={() => {
                clearStorageError();
                setStorageError(null);
              }}
              className="shrink-0 rounded px-2 py-0.5 text-xs hover:bg-destructive/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <header className="electron-header absolute inset-x-0 top-0 z-10 flex items-center">
        <div className="electron-traffic-spacer" aria-hidden />
        <div className="electron-no-drag flex items-center gap-0.5">
          <IconButton onClick={() => setSidebarOpen(true)} label="Open conversations" compact>
            <Menu size={18} />
          </IconButton>
          <IconButton onClick={newChat} label="New chat" compact>
            <SquarePen size={17} />
          </IconButton>
        </div>
        <div className="electron-chrome-drag flex-1 self-stretch" aria-hidden="true" />
      </header>

      <main className="h-full overflow-y-auto">
        {chat.messages.length === 0 ? (
          <EmptyState name={settingsHook.settings.name} />
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-44">
            <div className="space-y-6">
              {hiddenCount > 0 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((n) => n + LOAD_MORE_MESSAGE_STEP)
                    }
                    className="rounded-full border border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    Load earlier messages ({hiddenCount} hidden)
                  </button>
                </div>
              )}
              {visibleMessages.map((m, i) => {
                const globalIndex = hiddenCount > 0 ? hiddenCount + i : i;
                return (
                  <div key={m.id} className="message-row">
                    <MessageItem
                      message={m}
                      isStreaming={
                        chat.isStreaming &&
                        m.role === "assistant" &&
                        globalIndex === chat.messages.length - 1
                      }
                      collapseReasoningByDefault={
                        settingsHook.settings.reasoning.collapseByDefault
                      }
                    />
                  </div>
                );
              })}
              {chat.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {chat.error}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <ChatComposer
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        systemPrompt={systemPrompt}
        contextTokens={modelCapabilities.capabilities.contextTokens}
        modelCapabilitiesLoading={modelCapabilities.loading}
        modelCapabilitiesError={modelCapabilities.error}
        settings={settingsHook.settings}
        attachmentsHook={attachmentsHook}
        onSend={onSend}
        onStop={chat.stop}
        resetSignal={composerReset}
      />

      <ChatDisclaimer />
    </div>
  );
}

function ChatDisclaimer() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <p className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-2 text-center text-[10px] text-muted-foreground">
      The model can make mistakes. Verify important information.
    </p>,
    document.body,
  );
}

function IconButton({
  children,
  label,
  onClick,
  compact = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid place-items-center rounded-lg text-muted-foreground transition",
        compact ? "size-8" : "size-9",
        "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ name }: { name: string }) {
  const greeting = name.trim() ? `Hi ${name.trim()}.` : "Hello.";
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-medium tracking-tight [html.has-color-accent_&]:text-primary">
          {greeting}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">What would you like to talk about?</p>
      </div>
    </div>
  );
}
