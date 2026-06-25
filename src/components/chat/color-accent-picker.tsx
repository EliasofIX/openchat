"use client";

import { Check } from "@/components/icons";
import { ACCENT_PRESETS } from "@/lib/color-accent";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (color: string | null) => void;
};

const WHEEL_SIZE = 232;
const CENTER = WHEEL_SIZE / 2;
const RADIUS = 82;
const SWATCH = 30;

export function ColorAccentPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative shrink-0"
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        role="radiogroup"
        aria-label="Color accent"
      >
        <div
          className="pointer-events-none absolute inset-4 rounded-full border border-border/60 bg-muted/20"
          aria-hidden
        />

        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="Default accent"
          onClick={() => onChange(null)}
          className={cn(
            "absolute left-1/2 top-1/2 z-10 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[10px] font-medium transition",
            value === null
              ? "border-primary bg-background text-foreground shadow-sm ring-2 ring-primary/30"
              : "border-border bg-background/90 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
          )}
        >
          Default
        </button>

        {ACCENT_PRESETS.map((preset, index) => {
          const angle = (index / ACCENT_PRESETS.length) * Math.PI * 2 - Math.PI / 2;
          const x = CENTER + RADIUS * Math.cos(angle) - SWATCH / 2;
          const y = CENTER + RADIUS * Math.sin(angle) - SWATCH / 2;
          const selected = value === preset.color;

          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => onChange(preset.color)}
              style={{ left: x, top: y, width: SWATCH, height: SWATCH }}
              className={cn(
                "absolute rounded-full border-2 border-white/80 shadow-sm transition",
                "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selected && "scale-110 ring-2 ring-offset-2 ring-offset-background ring-primary",
              )}
            >
              <span
                className="block size-full rounded-full"
                style={{ backgroundColor: preset.color }}
              />
              {selected && (
                <span className="absolute inset-0 grid place-items-center text-white drop-shadow-sm">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {value
          ? `${ACCENT_PRESETS.find((p) => p.color === value)?.label ?? "Custom"} accent`
          : "Neutral theme — no color tint"}
      </p>
    </div>
  );
}
