# Open Chat

A minimal, **forkable** open-source AI chat UI.

- Next.js 16 (App Router) + TypeScript
- Tailwind v4 + shadcn-style tokens
- **OpenRouter** by default (swap to Ollama, Anthropic, Groq, or your own endpoint)
- Streaming, Markdown + LaTeX, code-block copy, dark mode, conversation history
- No Vercel AI SDK, no LangChain, no magic — ~100 lines of streaming code

Built so you can clone it, drop in a key, and ship — or rip out the provider in
~10 lines and point it at your own inference stack.

---

## Quick start

```bash
git clone <your fork>
cd openchat
npm install
cp .env.example .env.local      # fill in OPENROUTER_API_KEY
npm run dev
```

Open <http://localhost:3000>.

Get an OpenRouter key at <https://openrouter.ai/keys>. The free tier has dozens
of models you can use immediately — see <https://openrouter.ai/models>.

---

## Project layout

```
src/
  app/
    api/chat/route.ts     ← The ONLY file that talks to the AI provider.
    layout.tsx            ← Fonts, theme bootstrapping, KaTeX styles.
    page.tsx              ← Renders <Chat />.
    globals.css           ← Tailwind + design tokens.
  components/
    chat/
      chat.tsx            ← Top-level shell: sidebar + header + messages + input.
      chat-input.tsx      ← Auto-growing textarea with send / stop.
      message.tsx         ← User bubble + assistant markdown block.
      sidebar.tsx         ← Conversation list + settings entry point.
      settings-dialog.tsx ← Name + custom instructions, persisted locally.
    markdown.tsx          ← react-markdown + GFM + KaTeX + code blocks.
  hooks/
    use-chat.ts           ← Streaming engine. ~120 lines.
    use-conversations.ts  ← LocalStorage-backed conversation list.
    use-settings.ts       ← LocalStorage-backed user settings.
  lib/
    storage.ts            ← Tiny localStorage wrapper.
    types.ts              ← Message / Conversation / UserSettings.
    utils.ts              ← `cn()` class-name helper.
```

Every file is short on purpose. There are no clever abstractions to learn before
you can change something.

---

## How streaming works

There is **no SSE framing, no JSON envelopes, no SDK** between the model and the
browser. The flow is just:

1. The client `POST`s the conversation history to `/api/chat`.
2. The route handler calls the OpenRouter chat completions API with streaming
   enabled.
3. For each upstream chunk, the handler enqueues `delta.content` as raw UTF-8
   onto a `ReadableStream` and returns it.
4. The client reads `response.body` with `getReader()` + `TextDecoder` and
   appends every chunk to the current assistant message.

That's the whole streaming layer. Read `src/app/api/chat/route.ts` and
`src/hooks/use-chat.ts` together — under 200 lines total — and you'll understand
exactly what's happening.

---

## Swapping providers

Want to use Anthropic, Groq, an Ollama instance on your laptop, or your own
inference endpoint? Edit **one file**: `src/app/api/chat/route.ts`.

### Local Ollama (or any compatible chat API server)

```ts
const client = createOllamaClient("http://localhost:11434");
// streams through the same ReadableStream pattern
```

### Anthropic, Gemini, Bedrock, …

Replace the provider client call with the provider's SDK and stream their chunks
through the same `ReadableStream` pattern. The client doesn't care what's
producing the bytes.

---

## Configuration

All configuration lives in `.env.local` (git-ignored — see `.env.example` for
the template).

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | — | Your OpenRouter API key. Server-only. |
| `DEFAULT_MODEL` | no | `x-ai/grok-4.3` | Any OpenRouter model id. |
| `NEXT_PUBLIC_SITE_URL` | no | `http://localhost:3000` | Sent as `HTTP-Referer`. |
| `NEXT_PUBLIC_SITE_NAME` | no | `Open Chat` | Sent as `X-Title`. |

The API key never leaves the server — the browser only ever talks to
`/api/chat`.

---

## Secrets safety

`.gitignore` is configured so:

- `.env` and `.env.*` are **never** committed
- `.env.example` and `*.example` templates **are** committed

So as long as you put your real key in `.env.local`, you can `git push` to a
public repo without leaking it. Double-check with `git status` before your
first commit.

---

## What's deliberately missing

This is a base, not a product. The following are intentional non-features so
you can add what fits your stack:

- **Auth.** Add Clerk, Auth0, NextAuth, anything.
- **Server-side persistence.** Swap `src/lib/storage.ts` for a database.
- **Model picker UI.** The API already accepts `model` per request — wire a
  dropdown to it.
- **Tool calling / function calling.** Add `tools` to the chat completions call.
- **File uploads / vision.** Extend the `messages` payload with image parts.
- **Syntax highlighting.** Drop in `shiki` or `react-syntax-highlighter` inside
  `markdown.tsx` if you want highlighted code.

---

## Scripts

```bash
npm run dev      # local dev server (Turbopack)
npm run build    # production build
npm run start    # serve the production build
```

### Desktop (Electron)

```bash
npm run electron:dev   # Next dev server + Electron window
npm run electron:pack  # unpacked app in dist/ (quick local test)
npm run electron:dist  # installers (dmg/zip on macOS, nsis on Windows, AppImage on Linux)
```

The desktop build embeds the Next.js standalone server so `/api/*` routes keep working.
Set your OpenRouter key in **Settings → Model providers**, or ship a `.env.local` next to the app for defaults.

---

## License

MIT — do whatever you want. Attribution appreciated but not required.
