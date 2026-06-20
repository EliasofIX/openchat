"use client";

import { Check, ExternalLink, Eye, EyeOff, HardDrive, KeyRound, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_OLLAMA_BASE_URL, fetchOllamaModels, PROVIDER_LABELS } from "@/lib/providers";
import type { ModelProvider } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SettingsField, SettingsSection } from "./settings-ui";

type Props = {
  provider: ModelProvider;
  onProviderChange: (provider: ModelProvider) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (value: string) => void;
  ollamaModel: string;
  onOllamaModelChange: (value: string) => void;
};

export function ProvidersSettings({
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  ollamaBaseUrl,
  onOllamaBaseUrlChange,
  ollamaModel,
  onOllamaModelChange,
}: Props) {
  const [showApiKey, setShowApiKey] = useState(false);
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
      if (names.length > 0 && !names.includes(ollamaModel.trim()) && !ollamaModel.trim()) {
        onOllamaModelChange(names[0]);
      }
    } catch (err) {
      setOllamaModels([]);
      setModelsError((err as Error).message);
    } finally {
      setModelsLoading(false);
    }
  }, [ollamaBaseUrl, ollamaModel, onOllamaModelChange]);

  useEffect(() => {
    if (provider === "ollama") {
      void loadOllamaModels();
    }
  }, [provider, loadOllamaModels]);

  return (
    <div className="space-y-6">
      <section>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Choose where chat requests are sent.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ProviderCard
            icon={Sparkles}
            label={PROVIDER_LABELS.openrouter}
            description="Cloud models via OpenRouter"
            selected={provider === "openrouter"}
            onSelect={() => onProviderChange("openrouter")}
          />
          <ProviderCard
            icon={HardDrive}
            label={PROVIDER_LABELS.ollama}
            description="Local models on your machine"
            selected={provider === "ollama"}
            onSelect={() => onProviderChange("ollama")}
          />
        </div>
      </section>

      {provider === "openrouter" ? (
        <SettingsSection
          icon={Sparkles}
          title="OpenRouter"
          description="Bring your own key and pick any model from OpenRouter."
        >
          <SettingsField
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
                onChange={(e) => onApiKeyChange(e.target.value)}
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
          </SettingsField>

          <SettingsField
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
              onChange={(e) => onModelChange(e.target.value)}
              placeholder="x-ai/grok-4.3"
              className="font-mono text-xs"
              spellCheck={false}
            />
          </SettingsField>
        </SettingsSection>
      ) : (
        <SettingsSection
          icon={HardDrive}
          title="Ollama"
          description="Run models locally with Ollama. No API key required."
        >
          <SettingsField
            label="Base URL"
            hint={
              <span>
                Default is <code className="text-[10px]">http://localhost:11434</code>. Change this
                if Ollama runs on another host or port.
              </span>
            }
          >
            <Input
              type="url"
              value={ollamaBaseUrl}
              onChange={(e) => onOllamaBaseUrlChange(e.target.value)}
              placeholder={DEFAULT_OLLAMA_BASE_URL}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </SettingsField>

          <SettingsField
            label="Model"
            hint={
              <span>
                Pull models with{" "}
                <code className="text-[10px]">ollama pull &lt;model&gt;</code>, then refresh the
                list.
              </span>
            }
          >
            <div className="flex gap-2">
              {ollamaModels.length > 0 ? (
                <select
                  value={ollamaModel}
                  onChange={(e) => onOllamaModelChange(e.target.value)}
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
                  value={ollamaModel}
                  onChange={(e) => onOllamaModelChange(e.target.value)}
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
            {!modelsError && ollamaModels.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {ollamaModels.length} model{ollamaModels.length === 1 ? "" : "s"} available
              </p>
            )}
          </SettingsField>
        </SettingsSection>
      )}
    </div>
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
