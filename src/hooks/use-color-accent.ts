"use client";

import { useEffect } from "react";
import { applyColorAccent } from "@/lib/color-accent";

/** Sync persisted accent choice to CSS variables on <html>. */
export function useColorAccent(accent: string | null, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    applyColorAccent(accent);
  }, [accent, enabled]);
}
