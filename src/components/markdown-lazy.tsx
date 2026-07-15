"use client";

import dynamic from "next/dynamic";
import type { MessageSource } from "@/lib/types";

const MarkdownDynamic = dynamic(
  () => import("@/components/markdown").then((m) => m.Markdown),
  {
    ssr: false,
    loading: () => (
      <div className="h-4 w-3/4 max-w-md animate-pulse rounded bg-muted" />
    ),
  },
);

export function Markdown({
  content,
  sources,
  defer,
}: {
  content: string;
  sources?: MessageSource[];
  defer?: boolean;
}) {
  return <MarkdownDynamic content={content} sources={sources} defer={defer} />;
}
