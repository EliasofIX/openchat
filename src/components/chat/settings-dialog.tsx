"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Brain, ExternalLink, Eye, EyeOff, KeyRound, Sparkles, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { REASONING_EFFORT_LABELS, REASONING_EFFORTS } from "@/lib/openrouter";
import type { ReasoningEffort, UserSettings } from "@/lib/types";
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
  const [apiKey, setApiKey] = useState(settings.openRouterApiKey);
  const [model, setModel] = useState(settings.model);
  const [reasoningEnabled, setReasoningEnabled] = useState(settings.reasoning.enabled);
  const [reasoningEffort, setReasoningEffort] = useState(settings.reasoning.effort);
  const [showReasoning, setShowReasoning] = useState(settings.reasoning.showInResponse);
  const [collapseReasoning, setCollapseReasoning] = useState(settings.reasoning.collapseByDefault);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (open) {
      setName(settings.name);
      setInstructions(settings.customInstructions);
      setApiKey(settings.openRouterApiKey);
      setModel(settings.model);
      setReasoningEnabled(settings.reasoning.enabled);
      setReasoningEffort(settings.reasoning.effort);
      setShowReasoning(settings.reasoning.showInResponse);
      setCollapseReasoning(settings.reasoning.collapseByDefault);
      setShowApiKey(false);
    }
  }, [open, settings]);

  const save = () => {
    onSave({
      name: name.trim(),
      customInstructions: instructions,
      openRouterApiKey: apiKey.trim(),
      model: model.trim(),
      reasoning: {
        enabled: reasoningEnabled,
        effort: reasoningEffort,
        showInResponse: showReasoning,
        collapseByDefault: collapseReasoning,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col",
            "max-h-[min(90dvh,720px)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out-0",
          )}
        >
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0 pr-2">
              <Dialog.Title className="text-base font-semibold">Settings</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Stored locally in your browser. Your API key never leaves this device except
                when sent to OpenRouter for chat requests.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </Dialog.Close>
          </div>

          {/* Scrollable body — native overflow avoids ScrollArea flex bugs */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div className="space-y-6">
              <Section icon={User} title="Personalization" description="How the assistant addresses you.">
                <Field label="Your name">
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ada"
                  />
                </Field>
                <Field label="Custom instructions">
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Tone, format, things to remember about you…"
                    rows={3}
                    className={cn(
                      "w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
                      "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    )}
                  />
                </Field>
              </Section>

              <Separator />

              <Section
                icon={Sparkles}
                title="OpenRouter"
                description="Bring your own key and pick any model from OpenRouter."
              >
                <Field
                  label="API key"
                  hint={
                    <span>
                      Get one at{" "}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
                      >
                        openrouter.ai/keys
                        <ExternalLink size={10} />
                      </a>
                      . Leave blank to use the server&apos;s key.
                    </span>
                  }
                >
                  <div className="relative">
                    <KeyRound
                      size={14}
                      className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-or-v1-…"
                      className="pl-8 pr-9 font-mono text-xs"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </Field>

                <Field
                  label="Model"
                  hint={
                    <span>
                      Any OpenRouter model id.{" "}
                      <a
                        href="https://openrouter.ai/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
                      >
                        Browse models
                        <ExternalLink size={10} />
                      </a>
                    </span>
                  }
                >
                  <Input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="openai/gpt-4o-mini"
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                </Field>
              </Section>

              <Separator />

              <Section
                icon={Brain}
                title="Reasoning"
                description="Extended thinking for supported models (o-series, DeepSeek R1, etc.)."
              >
                <ToggleRow
                  label="Enable reasoning"
                  description="Let the model think before answering."
                  checked={reasoningEnabled}
                  onChange={setReasoningEnabled}
                />

                {reasoningEnabled && (
                  <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                    <Field label="Effort">
                      <div className="grid grid-cols-3 gap-1.5">
                        {REASONING_EFFORTS.map((effort) => (
                          <EffortButton
                            key={effort}
                            effort={effort}
                            selected={reasoningEffort === effort}
                            onSelect={() => setReasoningEffort(effort)}
                          />
                        ))}
                      </div>
                    </Field>

                    <ToggleRow
                      label="Show reasoning in chat"
                      description="Display the model's thinking above its reply."
                      checked={showReasoning}
                      onChange={setShowReasoning}
                    />

                    <ToggleRow
                      label="Collapse reasoning by default"
                      description="Hide thinking once the answer appears. Expand any message manually."
                      checked={collapseReasoning}
                      onChange={setCollapseReasoning}
                    />
                  </div>
                )}
              </Section>
            </div>
          </div>

          {/* Footer — pinned, never overlapped */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-5 py-4 sm:px-6">
            <Dialog.Close className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
              Cancel
            </Dialog.Close>
            <Button type="button" size="sm" onClick={save}>
              Save changes
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon size={15} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-sm font-medium leading-none">{title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-primary-foreground shadow-sm transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

function EffortButton({
  effort,
  selected,
  onSelect,
}: {
  effort: ReasoningEffort;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-md border px-2 py-1.5 text-[11px] font-medium transition",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {REASONING_EFFORT_LABELS[effort]}
    </button>
  );
}
