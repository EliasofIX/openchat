// ─────────────────────────────────────────────────────────────────────────────
// Search API — free DuckDuckGo proxy for the client web_search tool.
//
// Browser cannot scrape DDG (CORS). This route fetches HTML (and falls back to
// Instant Answer JSON) with no commercial SERP key. Personal / OSS use only.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isDuckDuckGoBotChallenge,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_RESULTS,
  parseDuckDuckGoHtml,
  parseDuckDuckGoInstantAnswer,
} from "@/lib/web-search";
import type { MessageSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 20;

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_INSTANT_URL = "https://api.duckduckgo.com/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type SearchRequest = {
  query?: string;
};

/** Client abort + wall-clock timeout (works when AbortSignal.any is missing). */
function withTimeoutSignal(signal: AbortSignal, ms: number): AbortSignal {
  if (
    typeof AbortSignal.any === "function" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
  }

  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort();
    return controller.signal;
  }

  const onAbort = () => {
    clearTimeout(timer);
    controller.abort();
  };
  const timer = setTimeout(() => {
    signal.removeEventListener("abort", onAbort);
    controller.abort();
  }, ms);
  signal.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

async function fetchDuckDuckGoHtml(
  query: string,
  signal: AbortSignal,
): Promise<{ results: MessageSource[]; blocked: boolean }> {
  const body = new URLSearchParams({ q: query, b: "" });
  const res = await fetch(DDG_HTML_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body,
    signal,
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo HTML returned ${res.status}`);
  }

  const html = await res.text();
  if (isDuckDuckGoBotChallenge(html)) {
    return { results: [], blocked: true };
  }
  return { results: parseDuckDuckGoHtml(html, MAX_SEARCH_RESULTS), blocked: false };
}

async function fetchDuckDuckGoInstantAnswer(
  query: string,
  signal: AbortSignal,
): Promise<MessageSource[]> {
  const url = new URL(DDG_INSTANT_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo Instant Answer returned ${res.status}`);
  }

  const data = (await res.json()) as Parameters<
    typeof parseDuckDuckGoInstantAnswer
  >[0];
  return parseDuckDuckGoInstantAnswer(data, MAX_SEARCH_RESULTS);
}

export async function POST(req: Request) {
  let body: SearchRequest;
  try {
    body = (await req.json()) as SearchRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query =
    typeof body.query === "string"
      ? body.query.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
      : "";

  if (!query) {
    return Response.json({ error: "Missing query." }, { status: 400 });
  }

  const upstream = withTimeoutSignal(req.signal, 12_000);

  try {
    let results: MessageSource[] = [];
    let source: "html" | "instant_answer" = "html";

    try {
      const html = await fetchDuckDuckGoHtml(query, upstream);
      results = html.results;
      if (results.length === 0) {
        results = await fetchDuckDuckGoInstantAnswer(query, upstream);
        source = "instant_answer";
      }
    } catch {
      results = await fetchDuckDuckGoInstantAnswer(query, upstream);
      source = "instant_answer";
    }

    return Response.json({ results, source, query });
  } catch (err) {
    if ((err as Error).name === "AbortError" || req.signal.aborted) {
      return Response.json({ error: "Search aborted." }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Search failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
