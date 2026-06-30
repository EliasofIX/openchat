export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export function glassSurface(...extra: Parameters<typeof cn>) {
  return cn("border border-border shadow-sm", ...extra);
}

export const glassPill = glassSurface;

/** Hidden until hover on desktop; always visible on touch / coarse pointers. */
export const touchVisible =
  "opacity-0 transition-opacity group-hover:opacity-100 coarse:opacity-100";

export const touchVisibleItem =
  "opacity-0 transition group-hover/item:opacity-100 coarse:opacity-60 coarse:hover:opacity-100";
