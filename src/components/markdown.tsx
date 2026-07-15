"use client";

// Streaming-friendly markdown renderer for assistant replies.
//
//   • GitHub-flavored markdown (tables, strikethrough, task lists)
//   • LaTeX via KaTeX — `$…$`, `$$…$$`, `\(...\)`, `\[...\]`, and ```latex fences
//   • Code blocks with a copy button
//
// Memoize on `content` + `defer`. During streaming, pass `defer` so
// `useDeferredValue` keeps markdown parsing off the hot path while tokens
// still arrive RAF-batched from use-chat (~60fps, ~10fps in low-power).

import "katex/dist/katex.min.css";

import {
  Children,
  isValidElement,
  memo,
  useDeferredValue,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "@/components/icons";
import { isMathCodeClassName, isMathCodeLanguage, MathBlock } from "@/components/math-block";
import { preprocessMathMarkdown } from "@/lib/preprocess-math";
import { linkifyCitationMarkers } from "@/lib/web-search";
import { cn } from "@/lib/utils";
import type { MessageSource } from "@/lib/types";

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace(/^language-/, "") ?? "";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-between border-b border-border bg-accent px-3 py-1.5 text-xs">
        <span className="font-mono text-muted-foreground">{language || "text"}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[0.85rem] leading-relaxed">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}

type CodeProps = ComponentPropsWithoutRef<"code">;

function codeText(children: ReactNode): string {
  return String(children ?? "").replace(/\n$/, "");
}

function isDisplayMath(className: string | undefined, text: string): boolean {
  return (
    Boolean(className?.includes("math-display")) ||
    isMathCodeLanguage(className) ||
    text.includes("\n") ||
    /\\begin\{/.test(text)
  );
}

function isCitationLinkLabel(children: ReactNode): boolean {
  const text = String(children ?? "").trim();
  return /^\[\d+\]$/.test(text);
}

// react-markdown v10 dropped the `inline` prop on `code`. Block fences are
// always wrapped in `pre`; inline backticks are not. Render blocks from `pre`
// so a `<div>` CodeBlock never lands inside a `<p>`.
const MARKDOWN_COMPONENTS = {
  a({
    href,
    children,
    className,
    ...rest
  }: ComponentPropsWithoutRef<"a">) {
    const citation = isCitationLinkLabel(children);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
        className={cn(
          citation
            ? "ml-0.5 inline-flex items-center rounded bg-muted px-1 py-px text-[0.7em] font-medium tabular-nums text-muted-foreground no-underline align-super hover:bg-accent hover:text-foreground"
            : undefined,
          className,
        )}
      >
        {children}
      </a>
    );
  },
  code(props: CodeProps) {
    const { className, children, ...rest } = props;
    const text = codeText(children);

    if (isMathCodeClassName(className)) {
      return <MathBlock content={text} display={isDisplayMath(className, text)} />;
    }

    return (
      <code
        className={cn(
          "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre({ children }: { children?: ReactNode }) {
    const child = Children.toArray(children)[0];
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
      return <>{children}</>;
    }

    // MathBlock (and anything else already upgraded) — pass through.
    if (typeof child.type !== "string") {
      return <>{children}</>;
    }

    const className = child.props.className;
    const text = codeText(child.props.children);

    if (isMathCodeClassName(className)) {
      return <MathBlock content={text} display={isDisplayMath(className, text)} />;
    }

    return <CodeBlock className={className}>{text}</CodeBlock>;
  },
};

function sourcesKey(sources: MessageSource[] | undefined): string {
  if (!sources?.length) return "";
  return sources.map((s) => `${s.index}:${s.url}`).join("|");
}

function MarkdownBody({
  content,
  sources,
}: {
  content: string;
  sources?: MessageSource[];
}) {
  const processedContent = useMemo(() => {
    const withCitations = linkifyCitationMarkers(content, sources);
    return preprocessMathMarkdown(withCitations);
  }, [content, sources]);

  return (
    <div
      className={cn(
        "prose-chat",
        "text-[0.95rem] leading-7 text-foreground",
        "[&_p]:my-3 first:[&_p]:mt-0 last:[&_p]:mb-0",
        "[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-1",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-foreground hover:[&_a]:opacity-80",
        "[&_hr]:my-6 [&_hr]:border-border",
        "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:bg-muted",
        "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5",
        "[&_.katex-display]:my-0",
      )}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

const MarkdownBodyMemo = memo(
  MarkdownBody,
  (prev, next) =>
    prev.content === next.content &&
    sourcesKey(prev.sources) === sourcesKey(next.sources),
);

function MarkdownInner({
  content,
  sources,
  defer = false,
}: {
  content: string;
  sources?: MessageSource[];
  defer?: boolean;
}) {
  const deferredContent = useDeferredValue(content);
  const renderContent = defer ? deferredContent : content;
  return <MarkdownBodyMemo content={renderContent} sources={sources} />;
}

export const Markdown = memo(
  MarkdownInner,
  (prev, next) =>
    prev.content === next.content &&
    prev.defer === next.defer &&
    sourcesKey(prev.sources) === sourcesKey(next.sources),
);
