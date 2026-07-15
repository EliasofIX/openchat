"use client";

import { memo, useEffect, useState } from "react";
import { ChevronDown, ExternalLink } from "@/components/icons";
import { sourceDomain } from "@/lib/web-search";
import { cn } from "@/lib/utils";
import type { MessageSource } from "@/lib/types";

type Props = {
  sources: MessageSource[];
  isSearching?: boolean;
  defaultOpen?: boolean;
};

function SourcesPanelInner({
  sources,
  isSearching = false,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (isSearching) {
      setOpen(true);
      return;
    }
    if (!userToggled) setOpen(defaultOpen);
  }, [isSearching, defaultOpen, userToggled]);

  if (sources.length === 0 && !isSearching) return null;

  const onToggle = () => {
    setUserToggled(true);
    setOpen((v) => !v);
  };

  const label = isSearching
    ? sources.length > 0
      ? `Searching… · ${sources.length} source${sources.length === 1 ? "" : "s"}`
      : "Searching…"
    : `${sources.length} source${sources.length === 1 ? "" : "s"}`;

  return (
    <div className="group mt-3">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 opacity-50 transition-transform duration-150",
              open && "rotate-180",
            )}
          />
          <span>{label}</span>
        </button>
      </div>

      {open && sources.length > 0 && (
        <ol className="mt-1 max-h-[min(40vh,320px)] space-y-2 overflow-y-auto border-l border-border/40 py-1 pl-3">
          {sources.map((source) => (
            <li key={`${source.index}-${source.url}`} className="min-w-0">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/source flex min-w-0 items-start gap-2 rounded-md px-1 py-0.5 text-left transition hover:bg-muted"
              >
                <span className="mt-0.5 shrink-0 tabular-nums text-[10px] font-medium text-muted-foreground">
                  [{source.index}]
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[0.8125rem] font-medium leading-snug text-foreground">
                    <span className="min-w-0 truncate">{source.title}</span>
                    <ExternalLink
                      size={10}
                      className="shrink-0 opacity-0 transition group-hover/source:opacity-60"
                    />
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {sourceDomain(source.url)}
                  </span>
                  {source.snippet && (
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground/80">
                      {source.snippet}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export const SourcesPanel = memo(SourcesPanelInner, (prev, next) => {
  if (prev.isSearching !== next.isSearching) return false;
  if (prev.defaultOpen !== next.defaultOpen) return false;
  if (prev.sources.length !== next.sources.length) return false;
  return prev.sources.every(
    (s, i) =>
      s.index === next.sources[i]?.index &&
      s.url === next.sources[i]?.url &&
      s.title === next.sources[i]?.title,
  );
});
