"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useVisualViewport — track iOS Safari virtual-keyboard overlap.
//
// Sets --keyboard-offset on <html> so the composer can pad above the keyboard.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export function useVisualViewport() {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
      document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, []);

  return { keyboardOffset };
}
