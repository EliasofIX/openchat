// ─────────────────────────────────────────────────────────────────────────────
// web-search — web_search tool definition + DuckDuckGo result helpers.
//
// The browser cannot scrape DDG directly (CORS). Tool execution still runs in
// the client agent loop (like save_memory); the actual fetch+parse lives in
// POST /api/search so it runs without CORS. No commercial SERP API keys.
// ─────────────────────────────────────────────────────────────────────────────

import type { MessageSource } from "@/lib/types";

export const WEB_SEARCH_TOOL_NAME = "web_search";

export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_SEARCH_RESULTS = 8;

export const WEB_SEARCH_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the web for current information. Use for news, facts that may change, or anything you are unsure about. Prefer 1–2 focused queries over many broad ones. Cite results in your answer as [1], [2], … matching the result indices returned.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (concise, specific).",
        },
      },
      required: ["query"],
    },
  },
};

export function webSearchSystemHint(): string {
  return (
    "You have a web_search tool. Use it when you need current information, " +
    "to verify facts, or when the user asks about recent events. " +
    "Cite sources inline as [1], [2], etc. matching the numbered results. " +
    "Prefer one or two focused searches over many broad ones."
  );
}

export function parseWebSearchArguments(argumentsJson: string): string | null {
  const trimmed = argumentsJson.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { query?: unknown };
    if (typeof parsed.query !== "string") return null;
    const query = parsed.query.trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
    return query || null;
  } catch {
    return null;
  }
}

export function formatSearchToolResult(results: MessageSource[]): string {
  if (results.length === 0) {
    return "No search results found.";
  }

  const lines = results.map((r) => {
    const snippet = r.snippet?.trim() ? ` — ${r.snippet.trim()}` : "";
    return `[${r.index}] ${r.title}\nURL: ${r.url}${snippet ? `\n${snippet}` : ""}`;
  });
  return (
    `Search results (${results.length}). Cite as [n] in your answer.\n\n` +
    lines.join("\n\n")
  );
}

function codePointFromEntity(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

/** Decode HTML entities commonly found in DDG titles/snippets. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => codePointFromEntity(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      codePointFromEntity(Number.parseInt(h, 16)),
    );
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/**
 * Unwrap DuckDuckGo redirect URLs (`//duckduckgo.com/l/?uddg=…`) to the target.
 */
export function unwrapDuckDuckGoUrl(href: string): string | null {
  const raw = href.trim();
  if (!raw) return null;

  let absolute = raw;
  if (raw.startsWith("//")) absolute = `https:${raw}`;
  else if (raw.startsWith("/")) absolute = `https://duckduckgo.com${raw}`;

  try {
    const url = new URL(absolute);
    const uddg = url.searchParams.get("uddg");
    if (uddg) {
      const decoded = decodeURIComponent(uddg);
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        return decoded;
      }
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      // Skip internal DDG chrome links.
      if (
        url.hostname.includes("duckduckgo.com") &&
        (url.pathname === "/" ||
          url.pathname.startsWith("/html") ||
          url.pathname.startsWith("/lite") ||
          url.pathname.startsWith("/y.js") ||
          url.pathname.startsWith("/l/"))
      ) {
        return null;
      }
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function isDuckDuckGoBotChallenge(html: string): boolean {
  return (
    html.includes("anomaly-modal") ||
    html.includes("bots use DuckDuckGo") ||
    html.includes("anomalyDetectionBlock")
  );
}

/**
 * Parse organic results from DuckDuckGo HTML (`html.duckduckgo.com/html/`).
 * Zero-dependency regex extraction — DDG's lite/html markup is stable enough.
 */
export function parseDuckDuckGoHtml(
  html: string,
  maxResults = MAX_SEARCH_RESULTS,
): MessageSource[] {
  if (!html || isDuckDuckGoBotChallenge(html)) return [];

  const results: MessageSource[] = [];
  const seen = new Set<string>();

  // Match <a> tags; accept either attribute order for class/href.
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null && results.length < maxResults) {
    const attrs = match[1];
    if (!/\bclass="[^"]*\bresult__a\b[^"]*"/i.test(attrs)) continue;
    const hrefMatch = /\bhref="([^"]+)"/i.exec(attrs);
    if (!hrefMatch) continue;

    const title = stripTags(match[2]);
    if (!title) continue;

    const url = unwrapDuckDuckGoUrl(hrefMatch[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    // Snippet often follows nearby as class="result__snippet".
    const after = html.slice(match.index, match.index + 2500);
    const snipMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/i.exec(
      after,
    );
    const snippet = snipMatch ? stripTags(snipMatch[1]) : undefined;

    results.push({
      index: results.length + 1,
      title,
      url,
      ...(snippet ? { snippet: snippet.slice(0, 400) } : {}),
    });
  }

  return results;
}

type InstantAnswerTopic = {
  Text?: string;
  FirstURL?: string;
  Topics?: InstantAnswerTopic[];
};

type InstantAnswerResponse = {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  Results?: InstantAnswerTopic[];
  RelatedTopics?: InstantAnswerTopic[];
};

function topicToSource(
  topic: InstantAnswerTopic,
  index: number,
): MessageSource | null {
  const url = topic.FirstURL?.trim();
  const text = topic.Text?.trim();
  if (!url || !text) return null;
  if (!isHttpUrl(url)) return null;

  // RelatedTopics text is often "Title - snippet"
  const dash = text.indexOf(" - ");
  const title = dash > 0 ? text.slice(0, dash).trim() : text;
  const snippet = dash > 0 ? text.slice(dash + 3).trim() : undefined;

  return {
    index,
    title: title || text,
    url,
    ...(snippet ? { snippet: snippet.slice(0, 400) } : {}),
  };
}

function flattenTopics(topics: InstantAnswerTopic[] | undefined): InstantAnswerTopic[] {
  if (!topics?.length) return [];
  const out: InstantAnswerTopic[] = [];
  for (const t of topics) {
    if (t.Topics?.length) out.push(...flattenTopics(t.Topics));
    else out.push(t);
  }
  return out;
}

/** Map DuckDuckGo Instant Answer JSON into numbered sources. */
export function parseDuckDuckGoInstantAnswer(
  data: InstantAnswerResponse,
  maxResults = MAX_SEARCH_RESULTS,
): MessageSource[] {
  const results: MessageSource[] = [];
  const seen = new Set<string>();

  const push = (source: MessageSource | null) => {
    if (!source || results.length >= maxResults) return;
    if (seen.has(source.url)) return;
    seen.add(source.url);
    results.push({ ...source, index: results.length + 1 });
  };

  const abstractUrl = data.AbstractURL?.trim();
  if (abstractUrl && isHttpUrl(abstractUrl) && (data.AbstractText || data.Heading)) {
    push({
      index: 1,
      title: data.Heading?.trim() || data.AbstractSource || "Result",
      url: abstractUrl,
      ...(data.AbstractText
        ? { snippet: data.AbstractText.trim().slice(0, 400) }
        : {}),
    });
  }

  for (const topic of flattenTopics(data.Results)) {
    push(topicToSource(topic, results.length + 1));
  }
  for (const topic of flattenTopics(data.RelatedTopics)) {
    push(topicToSource(topic, results.length + 1));
  }

  return results;
}

/** Merge search hits across tool rounds; unique by URL, renumber 1..N. */
export function mergeMessageSources(
  existing: MessageSource[] | undefined,
  incoming: MessageSource[],
): MessageSource[] {
  const merged: MessageSource[] = [];
  const seen = new Set<string>();

  for (const source of [...(existing ?? []), ...incoming]) {
    if (!source.url || seen.has(source.url)) continue;
    seen.add(source.url);
    merged.push({
      index: merged.length + 1,
      title: source.title,
      url: source.url,
      ...(source.snippet ? { snippet: source.snippet } : {}),
    });
  }
  return merged;
}

/**
 * Rewrite bare [n] citation markers into markdown links for known sources.
 * Skips fenced/inline code, image syntax, existing links, and identifier tails
 * like `arr[1]`. Uses angle-bracket destinations so `)` in URLs is safe.
 */
export function linkifyCitationMarkers(
  content: string,
  sources: MessageSource[] | undefined,
): string {
  if (!sources?.length || !content) return content;
  const byIndex = new Map(sources.map((s) => [s.index, s]));

  const linkifyProse = (text: string): string => {
    let out = "";
    let i = 0;
    while (i < text.length) {
      if (text[i] === "`") {
        let j = i;
        while (j < text.length && text[j] === "`") j += 1;
        const ticks = text.slice(i, j);
        const close = text.indexOf(ticks, j);
        if (close === -1) {
          out += text.slice(i);
          break;
        }
        out += text.slice(i, close + ticks.length);
        i = close + ticks.length;
        continue;
      }

      if (text[i] === "[") {
        const m = /^\[(\d+)\]/.exec(text.slice(i));
        if (m) {
          const after = text[i + m[0].length] ?? "";
          const before = i > 0 ? text[i - 1] : "";
          // Skip markdown links, images, and identifier/array index tails.
          if (after !== "(" && before !== "!" && !/\w/.test(before)) {
            const source = byIndex.get(Number(m[1]));
            if (source) {
              out += `[[${m[1]}]](<${source.url}>)`;
              i += m[0].length;
              continue;
            }
          }
          out += m[0];
          i += m[0].length;
          continue;
        }
      }

      out += text[i];
      i += 1;
    }
    return out;
  };

  // Protect fenced code blocks; linkify only prose segments between them.
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((segment) =>
      segment.startsWith("```") ? segment : linkifyProse(segment),
    )
    .join("");
}

/** Tool message when a search returned only URLs already in the source list. */
export function formatDuplicateSearchToolResult(sources: MessageSource[]): string {
  if (sources.length === 0) {
    return "These results were already retrieved earlier in this reply.";
  }
  const indices = sources.map((s) => `[${s.index}]`).join(", ");
  return (
    `These results were already retrieved earlier in this reply (${indices}). ` +
    "Cite them with [n]; no new sources were added."
  );
}

export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
