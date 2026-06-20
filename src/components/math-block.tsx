"use client";

import { useMemo } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

export function MathBlock({
  content,
  display = false,
  className,
}: {
  content: string;
  display?: boolean;
  className?: string;
}) {
  const rendered = useMemo(() => {
    const value = content.trim();
    if (!value) return { html: null, error: "Empty expression" };

    try {
      const html = katex.renderToString(value, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        trust: false,
      });
      return { html, error: null };
    } catch (error) {
      return { html: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [content, display]);

  if (!rendered.html) {
    return (
      <code className={cn("text-destructive", className)} title={rendered.error ?? undefined}>
        {content}
      </code>
    );
  }

  if (display) {
    return (
      <div
        className={cn("math-display-block", className)}
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    );
  }

  return (
    <span
      className={cn("math-inline", className)}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}

export function isMathCodeLanguage(className?: string): boolean {
  const language = className?.replace(/^language-/, "").toLowerCase() ?? "";
  return language === "latex" || language === "tex" || language === "math";
}

export function isMathCodeClassName(className?: string): boolean {
  if (!className) return false;
  return (
    isMathCodeLanguage(className) ||
    className.includes("math-inline") ||
    className.includes("math-display")
  );
}
