"use client";

// Streaming-friendly markdown renderer for assistant replies.
//
//   • GitHub-flavored markdown (tables, strikethrough, task lists)
//   • LaTeX via KaTeX — `$…$`, `$$…$$`, `\(...\)`, `\[...\]`, and ```latex fences
//   • Code blocks with a copy button
//
// We memoize on `content` so re-rendering during streaming is cheap even when
// the parent re-renders for unrelated reasons.

import "katex/dist/katex.min.css";

import { memo, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";
import { isMathCodeClassName, isMathCodeLanguage, MathBlock } from "@/components/math-block";
import { preprocessMathMarkdown } from "@/lib/preprocess-math";
import { cn } from "@/lib/utils";

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
    <div className="group relative my-4 overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/60 px-3 py-1.5 text-xs">
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

type CodeProps = ComponentPropsWithoutRef<"code"> & { inline?: boolean };

const MARKDOWN_COMPONENTS = {
  code(props: CodeProps) {
    const { inline, className, children, ...rest } = props;
    const text = String(children ?? "").replace(/\n$/, "");

    if (isMathCodeClassName(className)) {
      const display =
        !inline &&
        (className?.includes("math-display") ||
          isMathCodeLanguage(className) ||
          text.includes("\n") ||
          /\\begin\{/.test(text));
      return <MathBlock content={text} display={display} />;
    }

    if (inline) {
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{text}</CodeBlock>;
  },
  pre({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  },
};

function MarkdownInner({ content }: { content: string }) {
  const processedContent = useMemo(() => preprocessMathMarkdown(content), [content]);

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
        "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:bg-muted/60",
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

export const Markdown = memo(MarkdownInner, (prev, next) => prev.content === next.content);
