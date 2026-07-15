import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSearchToolResult,
  isDuckDuckGoBotChallenge,
  linkifyCitationMarkers,
  mergeMessageSources,
  parseDuckDuckGoHtml,
  parseDuckDuckGoInstantAnswer,
  parseWebSearchArguments,
  unwrapDuckDuckGoUrl,
} from "@/lib/web-search";
import type { MessageSource } from "@/lib/types";

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="result results_links web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.typescriptlang.org%2F&amp;rut=abc">
        TypeScript: JavaScript With Syntax For Types
      </a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.typescriptlang.org%2F">
      TypeScript is a strongly typed programming language that builds on JavaScript.
    </a>
  </div>
  <div class="result results_links web-result">
    <h2 class="result__title">
      <a href="https://github.com/microsoft/TypeScript" class="result__a">microsoft/TypeScript</a>
    </h2>
    <a class="result__snippet" href="https://github.com/microsoft/TypeScript">
      TypeScript is a superset of JavaScript that compiles to clean JavaScript.
    </a>
  </div>
  <div class="result results_links web-result">
    <h2 class="result__title">
      <a class="result__a" href="//duckduckgo.com/html/?q=foo">Internal chrome</a>
    </h2>
  </div>
</body>
</html>
`;

const BOT_HTML = `
<div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div>
`;

describe("parseWebSearchArguments", () => {
  it("parses and trims query", () => {
    assert.equal(parseWebSearchArguments('{"query":"  hello world  "}'), "hello world");
  });

  it("returns null for invalid JSON or missing query", () => {
    assert.equal(parseWebSearchArguments(""), null);
    assert.equal(parseWebSearchArguments("{"), null);
    assert.equal(parseWebSearchArguments('{"query":""}'), null);
    assert.equal(parseWebSearchArguments('{"q":"x"}'), null);
  });
});

describe("unwrapDuckDuckGoUrl", () => {
  it("unwraps uddg redirect params", () => {
    assert.equal(
      unwrapDuckDuckGoUrl(
        "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath&rut=x",
      ),
      "https://example.com/path",
    );
  });

  it("keeps plain external URLs", () => {
    assert.equal(unwrapDuckDuckGoUrl("https://example.com/a"), "https://example.com/a");
  });

  it("drops DDG chrome links without uddg", () => {
    assert.equal(unwrapDuckDuckGoUrl("https://duckduckgo.com/html/?q=x"), null);
  });
});

describe("parseDuckDuckGoHtml", () => {
  it("extracts title, unwrapped url, and snippet", () => {
    const results = parseDuckDuckGoHtml(SAMPLE_HTML);
    assert.equal(results.length, 2);
    assert.equal(results[0].index, 1);
    assert.equal(results[0].url, "https://www.typescriptlang.org/");
    assert.match(results[0].title, /TypeScript/);
    assert.match(results[0].snippet ?? "", /strongly typed/);
    assert.equal(results[1].url, "https://github.com/microsoft/TypeScript");
  });

  it("returns empty for bot challenges", () => {
    assert.equal(isDuckDuckGoBotChallenge(BOT_HTML), true);
    assert.deepEqual(parseDuckDuckGoHtml(BOT_HTML), []);
  });
});

describe("parseDuckDuckGoInstantAnswer", () => {
  it("maps abstract and related topics", () => {
    const results = parseDuckDuckGoInstantAnswer({
      Heading: "TypeScript",
      AbstractText: "A typed superset of JavaScript.",
      AbstractURL: "https://en.wikipedia.org/wiki/TypeScript",
      RelatedTopics: [
        {
          Text: "JavaScript - Programming language",
          FirstURL: "https://en.wikipedia.org/wiki/JavaScript",
        },
        {
          Topics: [
            {
              Text: "Anders Hejlsberg - Danish software engineer",
              FirstURL: "https://en.wikipedia.org/wiki/Anders_Hejlsberg",
            },
          ],
        },
      ],
    });
    assert.equal(results.length, 3);
    assert.equal(results[0].title, "TypeScript");
    assert.equal(results[1].title, "JavaScript");
    assert.equal(results[2].title, "Anders Hejlsberg");
  });

  it("skips non-http AbstractURL", () => {
    const results = parseDuckDuckGoInstantAnswer({
      Heading: "X",
      AbstractText: "Nope",
      AbstractURL: "javascript:alert(1)",
      RelatedTopics: [
        {
          Text: "Safe - ok",
          FirstURL: "https://example.com/safe",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].url, "https://example.com/safe");
  });
});

describe("mergeMessageSources / format / citations", () => {
  const a: MessageSource[] = [
    { index: 1, title: "A", url: "https://a.example", snippet: "sa" },
    { index: 2, title: "B", url: "https://b.example" },
  ];
  const b: MessageSource[] = [
    { index: 1, title: "A again", url: "https://a.example" },
    { index: 2, title: "C", url: "https://c.example" },
  ];

  it("merges unique by URL and renumbers", () => {
    const merged = mergeMessageSources(a, b);
    assert.equal(merged.length, 3);
    assert.deepEqual(
      merged.map((s) => s.url),
      ["https://a.example", "https://b.example", "https://c.example"],
    );
    assert.deepEqual(
      merged.map((s) => s.index),
      [1, 2, 3],
    );
  });

  it("formats tool results for the model", () => {
    const text = formatSearchToolResult(a);
    assert.match(text, /\[1\] A/);
    assert.match(text, /URL: https:\/\/a\.example/);
  });

  it("linkifies bare citation markers with angle-bracket destinations", () => {
    const withParen: MessageSource[] = [
      {
        index: 1,
        title: "Wiki",
        url: "https://en.wikipedia.org/wiki/Foo_(bar)",
      },
    ];
    const out = linkifyCitationMarkers("See [1] and [2] but not [9].", a);
    assert.equal(
      out,
      "See [[1]](<https://a.example>) and [[2]](<https://b.example>) but not [9].",
    );
    assert.equal(
      linkifyCitationMarkers("Cite [1].", withParen),
      "Cite [[1]](<https://en.wikipedia.org/wiki/Foo_(bar)>).",
    );
  });

  it("does not rewrite existing markdown links", () => {
    const out = linkifyCitationMarkers("[1](https://already.example)", a);
    assert.equal(out, "[1](https://already.example)");
  });

  it("does not rewrite citations inside code", () => {
    assert.equal(linkifyCitationMarkers("use `arr[1]` here", a), "use `arr[1]` here");
    assert.equal(
      linkifyCitationMarkers("```\nitems[1]\n```\nSee [1].", a),
      "```\nitems[1]\n```\nSee [[1]](<https://a.example>).",
    );
    assert.equal(linkifyCitationMarkers("arr[1] still", a), "arr[1] still");
  });
});
