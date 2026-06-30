"use client";

import { Settings, SquarePen, Trash2, X } from "@/components/icons";
import type { SidebarVariant } from "@/hooks/use-sidebar-open";
import { SIDEBAR_WIDTH_PX } from "@/lib/constants";
import type { Conversation } from "@/lib/types";
import { cn, touchVisibleItem } from "@/lib/utils";

type Props = {
  open: boolean;
  variant: SidebarVariant;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
};

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  closeOnSelect,
  onOpenChange,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  closeOnSelect: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (conversations.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        No conversations yet.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => (
        <li key={c.id} className="group/item relative">
          <button
            type="button"
            onClick={() => {
              onSelect(c.id);
              if (closeOnSelect) onOpenChange(false);
            }}
            className={cn(
              "block w-full truncate rounded-md px-2.5 py-2 pr-8 text-left text-sm transition",
              c.id === activeId
                ? "bg-sidebar-accent text-sidebar-accent-foreground [html.has-color-accent_&]:bg-[var(--user-accent-soft)] [html.has-color-accent_&]:text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent/70",
            )}
            title={c.title}
          >
            {c.title}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(c.id);
            }}
            aria-label="Delete conversation"
            className={cn(
              "absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md coarse:size-11",
              "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              touchVisibleItem,
            )}
          >
            <Trash2 size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function SidebarBody({
  variant,
  onOpenChange,
  onNewChat,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onOpenSettings,
}: Omit<Props, "open">) {
  const closeOnSelect = variant === "overlay";

  return (
  <div className="flex h-full flex-col" style={{ width: SIDEBAR_WIDTH_PX }}>
    {variant === "docked" ? (
      <div className="border-b border-sidebar-border p-2">
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition",
            "text-sidebar-foreground hover:bg-sidebar-accent/70",
          )}
        >
          <SquarePen size={15} className="text-muted-foreground" />
          <span>New chat</span>
        </button>
      </div>
    ) : (
      <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-3">
        <h2 className="text-sm font-medium">Conversations</h2>
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => onOpenChange(false)}
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground coarse:size-11"
        >
          <X size={16} />
        </button>
      </div>
    )}

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={onSelect}
        onDelete={onDelete}
        closeOnSelect={closeOnSelect}
        onOpenChange={onOpenChange}
      />
    </div>

    <div className="border-t border-sidebar-border p-2">
      <button
        type="button"
        onClick={onOpenSettings}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition",
          "text-sidebar-foreground hover:bg-sidebar-accent/70",
        )}
      >
        <Settings size={15} className="text-muted-foreground" />
        <span>Settings</span>
      </button>
    </div>
  </div>
  );
}

export function Sidebar({
  open,
  variant,
  onOpenChange,
  onNewChat,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onOpenSettings,
}: Props) {
  const body = (
    <SidebarBody
      variant={variant}
      onOpenChange={onOpenChange}
      onNewChat={onNewChat}
      conversations={conversations}
      activeId={activeId}
      onSelect={onSelect}
      onDelete={onDelete}
      onOpenSettings={onOpenSettings}
    />
  );

  if (variant === "docked") {
    return (
      <aside
        aria-hidden={!open}
        className={cn(
          "electron-sidebar relative h-dvh shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          open ? "border-sidebar-border" : "border-transparent",
        )}
        style={{ width: open ? SIDEBAR_WIDTH_PX : 0 }}
      >
        {body}
      </aside>
    );
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-30 bg-black/40"
      />
      <aside
        className={cn(
          "electron-sidebar oc-animate-slide-in-left fixed left-0 top-0 z-40 flex h-dvh flex-col shadow-lg",
          "border-y-0 border-l-0 border-r border-sidebar-border bg-sidebar",
          "text-sidebar-foreground outline-none",
          "pt-[var(--safe-top)] pb-[var(--safe-bottom)]",
        )}
        style={{ width: `min(86vw, ${SIDEBAR_WIDTH_PX}px)` }}
      >
        {body}
      </aside>
    </>
  );
}
