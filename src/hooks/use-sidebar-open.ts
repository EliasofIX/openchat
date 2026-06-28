"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SIDEBAR_DOCK_BREAKPOINT_PX } from "@/lib/constants";
import { storage } from "@/lib/storage";

export type SidebarVariant = "docked" | "overlay";

function dockQuery() {
  return window.matchMedia(`(min-width: ${SIDEBAR_DOCK_BREAKPOINT_PX}px)`);
}

export function useSidebarOpen() {
  const [open, setOpenState] = useState(false);
  const [variant, setVariant] = useState<SidebarVariant>("overlay");
  const [hydrated, setHydrated] = useState(false);
  const variantRef = useRef<SidebarVariant>("overlay");

  useEffect(() => {
    const mq = dockQuery();

    const apply = () => {
      const docked = mq.matches;
      const nextVariant: SidebarVariant = docked ? "docked" : "overlay";
      variantRef.current = nextVariant;
      setVariant(nextVariant);
      setOpenState(docked ? storage.loadSidebarOpen() : false);
      setHydrated(true);
    };

    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const setOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (variantRef.current === "docked") storage.saveSidebarOpen(next);
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, [setOpen]);

  return { open, setOpen, toggle, variant, hydrated };
}
