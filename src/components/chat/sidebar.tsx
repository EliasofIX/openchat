"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { HardDrive, Settings, Trash2, X } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
};

export function Sidebar({
  open,
  onOpenChange,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onOpenSettings,
  onOpenProviders,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        {/* Backdrop. Click-anywhere-to-close, non-modal so the page is still
            reachable via keyboard / screen readers. */}
        <Dialog.Overlay
          onClick={() => onOpenChange(false)}
          className={cn(
            "fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-0 top-0 z-40 flex h-dvh w-[min(86vw,300px)] flex-col",
            "border-r border-border bg-sidebar text-sidebar-foreground shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          )}
        >
          <div className="flex h-12 items-center justify-between border-b border-border/60 px-3">
            <Dialog.Title className="text-sm font-medium">Conversations</Dialog.Title>
            <Dialog.Close
              aria-label="Close sidebar"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((c) => (
                  <li key={c.id} className="group/item relative">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(c.id);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "block w-full truncate rounded-md px-2.5 py-2 pr-8 text-left text-sm transition",
                        c.id === activeId
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
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
                        "absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md",
                        "text-muted-foreground opacity-0 transition group-hover/item:opacity-100",
                        "hover:bg-background hover:text-foreground",
                      )}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-0.5 border-t border-border/60 p-2">
            <button
              type="button"
              onClick={onOpenProviders}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition",
                "text-sidebar-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <HardDrive size={15} className="text-muted-foreground" />
              <span>Model providers</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition",
                "text-sidebar-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <Settings size={15} className="text-muted-foreground" />
              <span>Settings</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
