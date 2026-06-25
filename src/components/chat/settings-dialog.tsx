"use client";

import { Brain, User, X } from "@/components/icons";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPanel } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { REASONING_EFFORT_LABELS, REASONING_EFFORTS } from "@/lib/openrouter";
import type { ReasoningEffort, TitleGenerationSettings, UserSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProvidersSettings } from "./providers-settings";
import { TitleSettings } from "./title-settings";
import {
  SettingsField,
  SettingsSection,
  SettingsTabButton,
  SettingsToggleRow,
} from "./settings-ui";

export type SettingsTab = "general" | "providers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: UserSettings;
  onSave: (patch: Partial<UserSettings>) => void;
  initialTab?: SettingsTab;
};

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  initialTab = "general",
}: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState(settings.name);
  const [instructions, setInstructions] = useState(settings.customInstructions);
  const [provider, setProvider] = useState(settings.provider);
  const [apiKey, setApiKey] = useState(settings.openRouterApiKey);
  const [model, setModel] = useState(settings.model);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(settings.ollamaBaseUrl);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);
  const [reasoningEnabled, setReasoningEnabled] = useState(settings.reasoning.enabled);
  const [reasoningEffort, setReasoningEffort] = useState(settings.reasoning.effort);
  const [showReasoning, setShowReasoning] = useState(settings.reasoning.showInResponse);
  const [collapseReasoning, setCollapseReasoning] = useState(settings.reasoning.collapseByDefault);
  const [titleGeneration, setTitleGeneration] = useState<TitleGenerationSettings>(
    settings.titleGeneration,
  );

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setName(settings.name);
      setInstructions(settings.customInstructions);
      setProvider(settings.provider);
      setApiKey(settings.openRouterApiKey);
      setModel(settings.model);
      setOllamaBaseUrl(settings.ollamaBaseUrl);
      setOllamaModel(settings.ollamaModel);
      setReasoningEnabled(settings.reasoning.enabled);
      setReasoningEffort(settings.reasoning.effort);
      setShowReasoning(settings.reasoning.showInResponse);
      setCollapseReasoning(settings.reasoning.collapseByDefault);
      setTitleGeneration(settings.titleGeneration);
    }
  }, [open, settings, initialTab]);

  const save = () => {
    onSave({
      name: name.trim(),
      customInstructions: instructions,
      provider,
      openRouterApiKey: apiKey.trim(),
      model: model.trim(),
      ollamaBaseUrl: ollamaBaseUrl.trim(),
      ollamaModel: ollamaModel.trim(),
      reasoning: {
        enabled: reasoningEnabled,
        effort: reasoningEffort,
        showInResponse: showReasoning,
        collapseByDefault: collapseReasoning,
      },
      titleGeneration,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold">Settings</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Stored locally in your browser. API keys stay on this device until sent to your
              chosen provider.
            </p>
            <div className="mt-3 flex gap-1.5">
              <SettingsTabButton active={tab === "general"} onClick={() => setTab("general")}>
                General
              </SettingsTabButton>
              <SettingsTabButton active={tab === "providers"} onClick={() => setTab("providers")}>
                Model providers
              </SettingsTabButton>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {tab === "general" ? (
            <div className="space-y-6">
              <SettingsSection
                icon={User}
                title="Personalization"
                description="How the assistant addresses you."
              >
                <SettingsField label="Your name">
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ada"
                  />
                </SettingsField>
                <SettingsField label="Custom instructions">
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Tone, format, things to remember about you…"
                    rows={3}
                    className={cn(
                      "w-full resize-y rounded-lg border border-border bg-muted px-2.5 py-2 text-sm text-foreground outline-none",
                      "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    )}
                  />
                </SettingsField>
              </SettingsSection>

              <Separator />

              <SettingsSection
                icon={Brain}
                title="Reasoning"
                description="Extended thinking for supported models (Hermes 4, o-series, DeepSeek R1, Qwen thinking, etc.)."
              >
                <SettingsToggleRow
                  label="Enable reasoning"
                  description="Let the model think before answering."
                  checked={reasoningEnabled}
                  onChange={setReasoningEnabled}
                />

                {reasoningEnabled && (
                  <div className="space-y-3 rounded-xl border border-border bg-muted p-3">
                    <SettingsField label="Effort">
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
                    </SettingsField>

                    <SettingsToggleRow
                      label="Show reasoning in chat"
                      description="Display the model's thinking above its reply."
                      checked={showReasoning}
                      onChange={setShowReasoning}
                    />

                    <SettingsToggleRow
                      label="Collapse reasoning by default"
                      description="Hide thinking once the answer appears. Expand any message manually."
                      checked={collapseReasoning}
                      onChange={setCollapseReasoning}
                    />
                  </div>
                )}
              </SettingsSection>

              <Separator />

              <TitleSettings
                titleGeneration={titleGeneration}
                onTitleGenerationChange={(patch) =>
                  setTitleGeneration((prev) => ({ ...prev, ...patch }))
                }
                ollamaBaseUrl={ollamaBaseUrl}
              />
            </div>
          ) : (
            <ProvidersSettings
              provider={provider}
              onProviderChange={setProvider}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              model={model}
              onModelChange={setModel}
              ollamaBaseUrl={ollamaBaseUrl}
              onOllamaBaseUrlChange={setOllamaBaseUrl}
              ollamaModel={ollamaModel}
              onOllamaModelChange={setOllamaModel}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <Button type="button" size="sm" onClick={save}>
            Save changes
          </Button>
        </div>
      </DialogPanel>
    </Dialog>
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
          ? "border-foreground bg-muted text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-foreground/15 hover:bg-muted hover:text-foreground",
      )}
    >
      {REASONING_EFFORT_LABELS[effort]}
    </button>
  );
}
