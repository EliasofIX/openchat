export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export function glassSurface(...extra: Parameters<typeof cn>) {
  return cn(
    "border border-black/[0.06] bg-white/50",
    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55)]",
    "backdrop-blur-lg backdrop-saturate-150",
    "dark:border-white/[0.1] dark:bg-white/[0.06]",
    "dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]",
    ...extra,
  );
}

export const glassPill = glassSurface;
