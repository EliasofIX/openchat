export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export function glassSurface(...extra: Parameters<typeof cn>) {
  return cn("border border-border shadow-sm", ...extra);
}

export const glassPill = glassSurface;
