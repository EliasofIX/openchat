"use client";

import { HardDrive, Plus, Trash2 } from "@/components/icons";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { MAX_MEMORIES } from "@/lib/storage";
import type { Memory, MemorySettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  SettingsField,
  SettingsSection,
  SettingsToggleRow,
} from "./settings-ui";

type Props = {
  memorySettings: MemorySettings;
  onMemorySettingsChange: (patch: Partial<MemorySettings>) => void;
  memories: Memory[];
  onAddMemory: (content: string) => boolean;
  onRemoveMemory: (id: string) => void;
};

export function MemorySettings({
  memorySettings,
  onMemorySettingsChange,
  memories,
  onAddMemory,
  onRemoveMemory,
}: Props) {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    if (!draft.trim()) return;
    if (onAddMemory(draft)) setDraft("");
  };

  return (
    <SettingsSection
      icon={HardDrive}
      title="Memory"
      description="Facts the assistant remembers across all chats. The model can save new ones with a tool when memory is enabled."
    >
      <SettingsToggleRow
        label="Enable memory"
        description="Inject saved memories into every chat and give the model a save_memory tool."
        checked={memorySettings.enabled}
        onChange={(enabled) => onMemorySettingsChange({ enabled })}
      />

      {memorySettings.enabled && (
        <div className="space-y-3 rounded-xl border border-border bg-muted p-3">
          <SettingsField
            label={`Saved memories (${memories.length}/${MAX_MEMORIES})`}
            hint="Add facts manually, or let the model save them during conversation."
          >
            <div className="flex gap-2">
              <Input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDraft();
                  }
                }}
                placeholder="e.g. Prefers concise answers"
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={addDraft}
                disabled={!draft.trim() || memories.length >= MAX_MEMORIES}
                aria-label="Add memory"
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition",
                  "hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                <Plus size={16} />
              </button>
            </div>
          </SettingsField>

          {memories.length > 0 ? (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto overscroll-contain">
              {memories.map((memory) => (
                <li
                  key={memory.id}
                  className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                >
                  <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
                    {memory.content}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {memory.source === "agent" && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        saved
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveMemory(memory.id)}
                      aria-label="Remove memory"
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No memories saved yet.</p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
