"use client";

import { HardDrive, Settings, Trash2, X } from "@/components/icons";
import type { Conversation } from "@/lib/types";
import { cn, glassSurface } from "@/lib/utils";

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
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={() => onOpenChange(false)}
        className="oc-animate-fade-in fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
      />
      <aside
        className={cn(
          glassSurface(
            "oc-animate-slide-in-left fixed left-0 top-0 z-40 flex h-dvh w-[min(86vw,300px)] flex-col",
            "border-y-0 border-l-0 border-r text-sidebar-foreground outline-none",
          ),
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-black/[0.06] px-3 dark:border-white/[0.08]">
          <h2 className="text-sm font-medium">Conversations</h2>
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => onOpenChange(false)}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]"
          >
            <X size={16} />
          </button>
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
                        ? "bg-black/[0.06] text-foreground dark:bg-white/[0.1]"
                        : "text-sidebar-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
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
                      "hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]",
                    )}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-0.5 border-t border-black/[0.06] p-2 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={onOpenProviders}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition",
              "text-sidebar-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
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
              "text-sidebar-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <Settings size={15} className="text-muted-foreground" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
}
