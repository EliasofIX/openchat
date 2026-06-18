"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { UserSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: UserSettings;
  onSave: (patch: Partial<UserSettings>) => void;
};

export function SettingsDialog({ open, onOpenChange, settings, onSave }: Props) {
  const [name, setName] = useState(settings.name);
  const [instructions, setInstructions] = useState(settings.customInstructions);

  // Re-sync local form state when the dialog re-opens with fresh values.
  useEffect(() => {
    if (open) {
      setName(settings.name);
      setInstructions(settings.customInstructions);
    }
  }, [open, settings]);

  const save = () => {
    onSave({ name: name.trim(), customInstructions: instructions });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-card p-6 shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out-0",
          )}
        >
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold">Settings</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Stored locally in your browser. Sent with every reply as a system prompt.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={14} />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <Field label="Your name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ada"
                className={cn(
                  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none",
                  "focus:border-foreground/40",
                )}
              />
            </Field>
            <Field label="Custom instructions">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="How should the assistant respond? Tone, format, things to remember about you…"
                rows={6}
                className={cn(
                  "w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none",
                  "focus:border-foreground/40",
                )}
              />
            </Field>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={save}
              className="rounded-lg bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
