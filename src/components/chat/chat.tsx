"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, SquarePen } from "lucide-react";
import { ChatInput } from "./chat-input";
import { MessageItem, StreamingCursor } from "./message";
import { SettingsDialog } from "./settings-dialog";
import { Sidebar } from "./sidebar";
import { useChat } from "@/hooks/use-chat";
import { useConversations } from "@/hooks/use-conversations";
import { buildSystemPrompt, useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

export function Chat() {
  const conv = useConversations();
  const settingsHook = useSettings();
  const systemPrompt = buildSystemPrompt(settingsHook.settings);

  const chat = useChat({
    systemPrompt,
    onFinish: (_msg, all) => conv.upsertActive(all),
  });

  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load messages from the active conversation when it changes (e.g. user
  // selects a different chat from the sidebar). We compare ids via a ref so
  // we don't fight in-flight streaming updates.
  const lastLoadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!conv.hydrated) return;
    const id = conv.active?.id ?? null;
    if (id !== lastLoadedId.current) {
      lastLoadedId.current = id;
      chat.setMessages(conv.active?.messages ?? []);
    }
  }, [conv.hydrated, conv.active, chat]);

  // Auto-scroll to bottom as messages arrive. `scrollIntoView` with `block:
  // "end"` is enough — the browser handles the smoothness.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages]);

  const onSubmit = () => {
    const text = input;
    setInput("");
    chat.send(text);
  };

  const newChat = () => {
    chat.stop();
    chat.setMessages([]);
    conv.createNew();
    setInput("");
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Sidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        conversations={conv.conversations}
        activeId={conv.activeId}
        onSelect={(id) => conv.select(id)}
        onDelete={conv.remove}
        onOpenSettings={() => {
          setSidebarOpen(false);
          setSettingsOpen(true);
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settingsHook.settings}
        onSave={settingsHook.update}
      />

      <header className="absolute left-0 top-0 z-10 flex items-center gap-1 p-2">
        <IconButton onClick={() => setSidebarOpen(true)} label="Open conversations">
          <Menu size={18} />
        </IconButton>
        <IconButton onClick={newChat} label="New chat">
          <SquarePen size={17} />
        </IconButton>
      </header>

      <main className="flex-1 overflow-y-auto">
        {chat.messages.length === 0 ? (
          <EmptyState name={settingsHook.settings.name} />
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-8">
            <div className="space-y-6">
              {chat.messages.map((m, i) => {
                const isLast = i === chat.messages.length - 1;
                const showCursor = chat.isStreaming && isLast && m.role === "assistant";
                return (
                  <div key={m.id}>
                    <MessageItem message={m} />
                    {showCursor && m.content === "" && (
                      <div className="flex h-7 items-center">
                        <StreamingCursor />
                      </div>
                    )}
                  </div>
                );
              })}
              {chat.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {chat.error}
                </div>
              )}
            </div>
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </main>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
        />
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          The model can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-lg text-muted-foreground transition",
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
        <h1 className="text-2xl font-medium tracking-tight">{greeting}</h1>
        <p className="mt-2 text-sm text-muted-foreground">What would you like to talk about?</p>
      </div>
    </div>
  );
}
