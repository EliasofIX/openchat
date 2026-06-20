"use client";

import { Check, ExternalLink, HardDrive, Loader2, RefreshCw, Sparkles, Type } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_OLLAMA_BASE_URL, fetchOllamaModels, PROVIDER_LABELS } from "@/lib/providers";
import type { ModelProvider, TitleGenerationSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SettingsField, SettingsSection, SettingsToggleRow } from "./settings-ui";

type Props = {
  titleGeneration: TitleGenerationSettings;
  onTitleGenerationChange: (patch: Partial<TitleGenerationSettings>) => void;
  ollamaBaseUrl: string;
};

export function TitleSettings({
  titleGeneration,
  onTitleGenerationChange,
  ollamaBaseUrl,
}: Props) {
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const loadOllamaModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const models = await fetchOllamaModels(ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL);
      const names = models.map((entry) => entry.name);
      setOllamaModels(names);
      if (
        names.length > 0 &&
        titleGeneration.provider === "ollama" &&
        !names.includes(titleGeneration.model.trim()) &&
        !titleGeneration.model.trim()
      ) {
        onTitleGenerationChange({ model: names[0] });
      }
    } catch (err) {
      setOllamaModels([]);
      setModelsError((err as Error).message);
    } finally {
      setModelsLoading(false);
    }
  }, [ollamaBaseUrl, onTitleGenerationChange, titleGeneration.model, titleGeneration.provider]);

  useEffect(() => {
    if (titleGeneration.provider === "ollama" && titleGeneration.enabled) {
      void loadOllamaModels();
    }
  }, [titleGeneration.provider, titleGeneration.enabled, loadOllamaModels]);

  return (
    <SettingsSection
      icon={Type}
      title="Chat titles"
      description="Automatically name conversations after the first reply using a lightweight model."
    >
      <SettingsToggleRow
        label="Generate titles with AI"
        description="Replace the first-message preview with a short AI-generated title."
        checked={titleGeneration.enabled}
        onChange={(enabled) => onTitleGenerationChange({ enabled })}
      />

      {titleGeneration.enabled && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
          <SettingsField label="Provider">
            <div className="grid grid-cols-2 gap-2">
              <ProviderCard
                icon={Sparkles}
                label={PROVIDER_LABELS.openrouter}
                description="Fast cloud models"
                selected={titleGeneration.provider === "openrouter"}
                onSelect={() => onTitleGenerationChange({ provider: "openrouter" })}
              />
              <ProviderCard
                icon={HardDrive}
                label={PROVIDER_LABELS.ollama}
                description="Local models"
                selected={titleGeneration.provider === "ollama"}
                onSelect={() => onTitleGenerationChange({ provider: "ollama" })}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Uses the same API key and Ollama URL from Model providers.
            </p>
          </SettingsField>

          {titleGeneration.provider === "openrouter" ? (
            <SettingsField
              label="Title model"
              hint={
                <span>
                  Pick a fast, inexpensive model.{" "}
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
                value={titleGeneration.model}
                onChange={(e) => onTitleGenerationChange({ model: e.target.value })}
                placeholder="google/gemini-2.0-flash-001"
                className="font-mono text-xs"
                spellCheck={false}
              />
            </SettingsField>
          ) : (
            <SettingsField
              label="Title model"
              hint={
                <span>
                  Pull models with{" "}
                  <code className="text-[10px]">ollama pull &lt;model&gt;</code>, then refresh.
                </span>
              }
            >
              <div className="flex gap-2">
                {ollamaModels.length > 0 ? (
                  <select
                    value={titleGeneration.model}
                    onChange={(e) => onTitleGenerationChange({ model: e.target.value })}
                    className={cn(
                      "h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none",
                      "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    )}
                  >
                    <option value="">Select a model…</option>
                    {ollamaModels.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={titleGeneration.model}
                    onChange={(e) => onTitleGenerationChange({ model: e.target.value })}
                    placeholder="llama3.2"
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOllamaModels()}
                  disabled={modelsLoading}
                  className="shrink-0 gap-1.5"
                >
                  {modelsLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Refresh
                </Button>
              </div>
              {modelsError && (
                <p className="mt-2 text-[11px] leading-relaxed text-destructive">{modelsError}</p>
              )}
            </SettingsField>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

function ProviderCard({
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative rounded-xl border p-3 text-left transition",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-muted/10 hover:border-foreground/20 hover:bg-muted/20",
      )}
    >
      {selected && (
        <span className="absolute top-2.5 right-2.5 text-primary">
          <Check size={14} />
        </span>
      )}
      <div
        className={cn(
          "mb-2 grid size-8 place-items-center rounded-lg",
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon size={15} />
      </div>
      <p className="text-sm font-medium leading-none">{label}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
    </button>
  );
}
