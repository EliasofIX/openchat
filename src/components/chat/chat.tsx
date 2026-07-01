"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import { PanelLeft, PanelLeftClose, SquarePen } from "@/components/icons";
import { ChatComposer } from "./chat-composer";
import { MessageItem } from "./message";
import type { SettingsTab, SettingsScrollTarget } from "./settings-dialog";
import { useChat } from "@/hooks/use-chat";
import type { PromptCacheUsage } from "@/lib/prompt-cache";
import { useAttachments } from "@/hooks/use-attachments";
import { useLowPower } from "@/hooks/use-low-power";
import { useModelCapabilities } from "@/hooks/use-model-capabilities";
import { useConversations } from "@/hooks/use-conversations";
import { useSidebarOpen } from "@/hooks/use-sidebar-open";
import { useColorAccent } from "@/hooks/use-color-accent";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { buildSystemPrompt, useSettings } from "@/hooks/use-settings";
import { useMemories } from "@/hooks/use-memories";
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

const SCROLL_STICK_THRESHOLD_PX = 80;

export function Chat() {
  useLowPower();
  useVisualViewport();

  const conv = useConversations();
  const settingsHook = useSettings();
  const memoriesHook = useMemories();
  useColorAccent(settingsHook.settings.colorAccent, settingsHook.hydrated);

  const activeModel = getActiveModel(settingsHook.settings);
  const modelCapabilities = useModelCapabilities({
    provider: settingsHook.settings.provider,
    model: activeModel,
    apiKey: settingsHook.settings.openRouterApiKey,
    ollamaBaseUrl: settingsHook.settings.ollamaBaseUrl,
  });

  const memoryToolsAvailable = modelCapabilities.capabilities.tools;
  const memoryEnabled =
    settingsHook.settings.memory.enabled && memoryToolsAvailable;
  const memoryToolsUnavailable =
    settingsHook.settings.memory.enabled &&
    !modelCapabilities.loading &&
    !memoryToolsAvailable;

  const systemPrompt = buildSystemPrompt(settingsHook.settings, memoriesHook.memories);
  const settingsRef = useRef(settingsHook.settings);
  const convRef = useRef(conv);
  const lastUpsertRef = useRef<{ id: string; aiTitleGenerated: boolean } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const storageReady =
    conv.hydrated && settingsHook.hydrated && memoriesHook.hydrated;

  useEffect(() => {
    settingsRef.current = settingsHook.settings;
  }, [settingsHook.settings]);

  useEffect(() => {
    convRef.current = conv;
  }, [conv]);

  const [composerReset, setComposerReset] = useState(0);
  const [lastCacheUsage, setLastCacheUsage] = useState<PromptCacheUsage | null>(null);

  useEffect(() => {
    setLastCacheUsage(null);
  }, [conv.activeId]);

  const chat = useChat({
    systemPrompt,
    provider: settingsHook.settings.provider,
    model: activeModel,
    apiKey: settingsHook.settings.openRouterApiKey,
    ollamaBaseUrl: settingsHook.settings.ollamaBaseUrl,
    reasoning: settingsHook.settings.reasoning,
    memoryEnabled,
    promptCaching: settingsHook.settings.promptCaching,
    sessionId: conv.activeId,
    onCacheUsage: setLastCacheUsage,
    onSaveMemory: (content) => memoriesHook.tryAdd(content, "agent"),
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

  const attachmentsHook = useAttachments(
    activeModel,
    modelCapabilities.capabilities,
    modelCapabilities.loading,
  );

  const sidebar = useSidebarOpen();
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settingsScrollTo, setSettingsScrollTo] = useState<SettingsScrollTarget | null>(null);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_MESSAGE_LIMIT);
  const [storageError, setStorageError] = useState(getStorageError());

  const lastLoadedId = useRef<string | null>(null);
  const setMessages = chat.setMessages;

  useEffect(() => onStorageError(setStorageError), []);

  useEffect(() => {
    if (sidebar.open || sidebar.variant === "docked") setSidebarMounted(true);
  }, [sidebar.open, sidebar.variant]);

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setSettingsScrollTo(null);
    setSettingsOpen(true);
  };

  const openMemorySettings = useCallback(() => {
    setSettingsTab("general");
    setSettingsScrollTo("memory");
    setSettingsOpen(true);
  }, []);

  useEffect(() => {
    if (!conv.hydrated) return;
    const id = conv.activeId ?? null;
    if (id !== lastLoadedId.current) {
      lastLoadedId.current = id;
      const active = conv.conversations.find((c) => c.id === id);
      setMessages(active?.messages ?? []);
      setVisibleCount(VISIBLE_MESSAGE_LIMIT);
      stickToBottomRef.current = true;
    }
  }, [conv.hydrated, conv.activeId, conv.conversations, setMessages]);

  const hiddenCount = Math.max(0, chat.messages.length - visibleCount);
  const visibleMessages =
    hiddenCount > 0 ? chat.messages.slice(-visibleCount) : chat.messages;

  const onMainScroll = () => {
    const el = mainRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_STICK_THRESHOLD_PX;
  };

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = mainRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.isStreaming, visibleCount]);

  const onSend = (text: string, files: MessageAttachment[]) => {
    if (!storageReady) return;
    stickToBottomRef.current = true;
    chat.send(text, files);
  };

  const newChat = () => {
    chat.setMessages([]);
    conv.createNew();
    lastUpsertRef.current = null;
    attachmentsHook.clear();
    setComposerReset((n) => n + 1);
    setVisibleCount(VISIBLE_MESSAGE_LIMIT);
    stickToBottomRef.current = true;
  };

  const showHeaderNewChat = !sidebar.open || sidebar.variant === "overlay";

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {sidebarMounted && (
        <Sidebar
          open={sidebar.open}
          variant={sidebar.variant}
          onOpenChange={sidebar.setOpen}
          onNewChat={newChat}
          conversations={conv.conversations}
          activeId={conv.activeId}
          onSelect={(id) => conv.select(id)}
          onDelete={conv.remove}
          onOpenSettings={() => openSettings("general")}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {settingsOpen && (
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={settingsHook.settings}
            onSave={settingsHook.update}
            memories={memoriesHook.memories}
            onTryAddMemory={(content) => memoriesHook.tryAdd(content, "user")}
            onRemoveMemory={memoriesHook.remove}
            initialTab={settingsTab}
            scrollTo={settingsScrollTo}
            onScrolled={() => setSettingsScrollTo(null)}
          />
        )}

        <header className="electron-header z-10 flex shrink-0 items-center">
          <div className="electron-traffic-spacer" aria-hidden />
          <div className="electron-no-drag flex items-center gap-0.5">
            <IconButton
              onClick={sidebar.toggle}
              label={sidebar.open ? "Close sidebar" : "Open sidebar"}
              compact
              aria-expanded={sidebar.open}
            >
              {sidebar.open ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </IconButton>
            {showHeaderNewChat && (
              <IconButton onClick={newChat} label="New chat" compact>
                <SquarePen size={17} />
              </IconButton>
            )}
          </div>
          <div className="electron-chrome-drag flex-1 self-stretch" aria-hidden="true" />
        </header>

        {storageError === "quota_exceeded" && (
          <div className="shrink-0 px-4 pb-2">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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

        <main
          ref={mainRef}
          onScroll={onMainScroll}
          className="oc-chat-scroll min-h-0 flex-1 overflow-y-auto"
        >
          {chat.messages.length === 0 ? (
            <EmptyState name={settingsHook.settings.name} />
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 py-4">
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
                        onOpenMemorySettings={
                          settingsHook.settings.memory.enabled
                            ? openMemorySettings
                            : undefined
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
          promptCachingMode={modelCapabilities.capabilities.promptCaching}
          lastCacheUsage={lastCacheUsage}
          modelCapabilitiesLoading={modelCapabilities.loading}
          modelCapabilitiesError={modelCapabilities.error}
          memoryToolsUnavailable={memoryToolsUnavailable}
          settings={settingsHook.settings}
          attachmentsHook={attachmentsHook}
          onSend={onSend}
          onStop={chat.stop}
          resetSignal={composerReset}
        />
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  compact = false,
  "aria-expanded": ariaExpanded,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  compact?: boolean;
  "aria-expanded"?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={ariaExpanded}
      className={cn(
        "grid place-items-center rounded-lg text-muted-foreground transition",
        compact ? "size-8 coarse:size-11" : "size-9 coarse:size-11",
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
    <div className="flex h-full min-h-[40dvh] items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-medium tracking-tight [html.has-color-accent_&]:text-primary">
          {greeting}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">What would you like to talk about?</p>
      </div>
    </div>
  );
}
