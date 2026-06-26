"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useLowPower — toggle `.low-power` on <html> for browser sessions.
// Electron sets this via preload IPC; on the web we derive it from visibility,
// reduced-motion preference, and (when available) battery state.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

export function useLowPower() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Packaged desktop builds manage low-power via electron/preload.js.
    if ("electronShell" in window) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onBattery = false;

    const apply = () => {
      const lowPower =
        document.visibilityState === "hidden" ||
        reducedMotion.matches ||
        onBattery;
      document.documentElement.classList.toggle("low-power", lowPower);
    };

    const onVisibility = () => apply();
    const onMotion = () => apply();

    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", onMotion);

    type BatteryManager = {
      charging: boolean;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    };

    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };

    let battery: BatteryManager | null = null;
    const onBatteryChange = () => {
      if (battery) onBattery = !battery.charging;
      apply();
    };

    void nav.getBattery?.().then((b) => {
      battery = b;
      onBatteryChange();
      b.addEventListener("chargingchange", onBatteryChange);
    });

    apply();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", onMotion);
      battery?.removeEventListener("chargingchange", onBatteryChange);
      document.documentElement.classList.remove("low-power");
    };
  }, []);
}
