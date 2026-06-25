"use client";

import dynamic from "next/dynamic";

const MarkdownDynamic = dynamic(
  () => import("@/components/markdown").then((m) => m.Markdown),
  {
    ssr: false,
    loading: () => (
      <div className="h-4 w-3/4 max-w-md animate-pulse rounded bg-muted" />
    ),
  },
);

export function Markdown({ content }: { content: string }) {
  return <MarkdownDynamic content={content} />;
}
