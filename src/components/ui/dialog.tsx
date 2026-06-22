"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-4 backdrop:bg-black/50 open:flex open:backdrop:backdrop-blur-sm"
      onClose={() => onOpenChange(false)}
      onClick={(e) => {
        if (e.target === ref.current) onOpenChange(false);
      }}
    >
      {children}
    </dialog>
  );
}

export function DialogPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "oc-animate-zoom-in relative z-50 flex max-h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
