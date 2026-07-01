<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Open Chat — agent conventions

Open Chat is a **minimal, forkable** AI chat UI. The goal is code you can read in one sitting, change in one file, and ship without learning a framework inside a framework.

When working in this repo, **prefer rewriting small pieces ourselves** over pulling in libraries — especially for chat, streaming, persistence, and provider logic.

If you catch a repeatable mistake, **update this file** so the next agent does not make it again (see [Self-improvement](#self-improvement-update-this-file)).

---

## Philosophy

1. **Readable over clever.** Short files, obvious data flow, no hidden magic.
2. **Forkable over feature-complete.** This is a base, not a product. Missing features are intentional extension points.
3. **Own the core path.** Chat streaming, storage, provider wiring, and types should stay in-repo and easy to trace.
4. **Minimal scope.** The smallest correct diff wins. Do not refactor or abstract unrelated code.

---

## Dependency policy

### Do not add

- **Vercel AI SDK**, LangChain, LlamaIndex, or similar chat/agent frameworks
- Global state libraries (Redux, Zustand, Jotai, …) — React state + hooks are enough
- ORMs, auth SDKs, or databases unless explicitly requested
- Utility grab-bags (`lodash`, `ramda`, …) for one-liners
- New UI component libraries beyond what is already here

If a feature can be implemented in ~50–150 lines with `fetch`, `ReadableStream`, and plain TypeScript, **write it** — do not install a package.

### Allowed dependencies (already in use)

| Area | Packages | Notes |
| --- | --- | --- |
| Framework | `next`, `react`, `react-dom` | App Router, React 19 |
| Styling | `tailwindcss` | Design tokens in `src/app/tokens.css`; `cn()` in `src/lib/utils.ts` |
| UI primitives | Native HTML + Tailwind in `src/components/ui/` | Icons in `src/components/icons.tsx` |
| Provider HTTP | `fetch` via `src/lib/ai-client.ts` | OpenRouter + Ollama OpenAI-compatible APIs — not “the AI SDK” |
| Markdown / math | `react-markdown`, `remark-*`, `rehype-*`, `katex` | Rendering only |
| PDF attachments | `pdfjs-dist` | Client-side text extraction; worker self-hosted at `public/pdf.worker.min.mjs` |

Before adding **any** new dependency, ask: can we do this in a small module under `src/lib/`? If yes, do that.

---

## Architecture

```
src/
  app/api/          Server routes — secrets stay here
  components/       React UI (chat/ for feature UI, ui/ for primitives)
  hooks/            Client state + side effects (use-chat, use-conversations, …)
  lib/              Pure helpers, types, provider logic — no React
```

### Data flow (chat)

```
Browser (use-chat)
  → POST /api/chat with message history
  → route handler calls OpenRouter or Ollama via fetch (`src/lib/ai-client.ts`)
  → streams raw UTF-8 or NDJSON lines back
  → client reads response.body with getReader() + TextDecoder
```

There is **no SSE framing, no JSON envelope protocol, no SDK** between model and browser. Read `src/app/api/chat/route.ts` and `src/hooks/use-chat.ts` together — that is the whole streaming layer.

- **In-flight streams:** `use-chat` bumps a generation counter on `setMessages` (conversation switch / load) and aborts the fetch; flush/finish/persist callbacks must no-op when their captured generation is stale — otherwise a reply started in chat A can be saved into chat B.
- **Upstream abort:** Thread `req.signal` into `ai-client.stream()` and abort in the route's `ReadableStream.cancel()` so Stop doesn't leave OpenRouter/Ollama streaming until `maxDuration`.
- **Model capabilities:** POST BYOK keys in the request body (`/api/models/capabilities`) — never in query strings.

### Provider changes

- **Chat streaming:** `src/app/api/chat/route.ts`
- **Non-streaming completions** (e.g. title generation): `src/lib/ai-completion.ts`
- **Provider helpers / model resolution:** `src/lib/providers.ts`
- **Model context windows:** read `context_length` from OpenRouter `/models` and `*.context_length` from Ollama `/api/show` `model_info`; cap Ollama by parsed `num_ctx`. Extend `ModelCapabilities` in `src/lib/model-capabilities.ts` — do not add a separate metadata route.
- **Client never sees API keys** — keys come from env or user settings, resolved server-side

To swap providers, edit the route (or `ai-completion.ts`), keep the same `ReadableStream` / NDJSON pattern on the wire.

- **OpenRouter reasoning:** send `reasoning.enabled: true` (not just `effort`) — required for boolean-only models like Hermes 4. Nebius-hosted Hermes 4 ignores `effort`. Do **not** send legacy `include_reasoning` alongside the unified `reasoning` object — it conflicts with `reasoning.exclude` and makes providers stream thinking in `delta.content` instead of `delta.reasoning` / `reasoning_details`. Inject the Hermes `` / `<think>` directive into the system prompt when reasoning is on. Use NDJSON whenever reasoning is enabled; gate what the client sees with `showInResponse`, not the stream format. Split tagged blocks and untagged monologue-before-answer (blank-line delimiter via `createPlainReasoningSplitter`) from `content` in `reasoning.ts` when providers embed thinking there; on stream end run `reconcileReasoningAndContent` so answers glued after a `. ` (no blank line) don't stay in the CoT panel — `createPlainReasoningSplitter.flush` must reconcile the full pre-delimiter buffer, not just `carry`. `reconcileReasoningAndContent` must also dedupe two real-world shapes: (a) the streamer ships the whole monologue (final answer included) as reasoning and then re-emits the rescued answer as content — strip the trailing duplicate from reasoning when `r.endsWith(c)`; (b) models that emit dedicated reasoning *and* leak self-talk into `delta.content` (e.g. `Alright, "X" should work. X` or `Hmm, I need to follow the format... Hey! Answer.`) — pull the answer out via `splitTrailingAnswerFromReasoning(c)` and trust the rescue when either the tail also matches the end of `reasoning` (duplication signal) OR the rescued preamble itself contains meta-words (clear leak signal). When trusting on the meta signal alone, append the preamble to `reasoning` so it shows up in the CoT panel. `splitTrailingAnswerFromReasoning` walks `.`/`!`/`?` sentence boundaries backward and keeps the **longest contiguous clean trailing portion** — once it crosses a meta sentence and then re-enters clean text it stops (otherwise it would pick a clean sentence buried inside earlier reasoning). Keep `REASONING_META` specific — bare `Let me` matches `Let me know` and over-trims; require known meta verbs (`Let me think|see|check|verify|...`) and include real transition phrases (`alright, let|here|so|i`, `let's go with`, `after thinking`, `should work`, `i'll just`).
- **OpenRouter prompt caching:** OpenRouter-only (`src/lib/prompt-cache.ts`). Pass `session_id` (conversation id) for sticky routing; Anthropic models get top-level `cache_control`; Gemini/Qwen/Alibaba get explicit per-block breakpoints on large system text and attachments. Request `stream_options: { include_usage: true }` and emit a trailing NDJSON `{ "p": "usage", "prompt", "cached", "written" }` line — switch to NDJSON whenever caching is on, even without reasoning/memory. Settings live in `UserSettings.promptCaching` (enabled + TTL).

### Persistence

- `src/lib/storage.ts` — per-conversation `localStorage` keys + index; settings/active id
- `src/lib/attachment-store.ts` — IndexedDB for attachment `dataUrl` / `textContent` blobs
- `src/lib/hydrate-messages.ts` — resolve attachment refs from IDB for render and API calls
- `src/hooks/use-conversations.ts` / `use-settings.ts` — hydration + debounced save effects
- Legacy `openchat:conversations` monolithic key is migrated once on first load
- Swap `storage.ts` for a database when adding server-side persistence — do not introduce an ORM in the same change unless asked

### Types

- `src/lib/types.ts` — shared `Message`, `Conversation`, `UserSettings`, etc.
- Keep types small and colocated; extend here rather than scattering duplicates

### Desktop (Electron)

- `electron/main.mjs` spawns the Next.js standalone server as a child and opens the window. Clean it up on **every** exit path — `before-quit`, `window-all-closed`, `SIGINT`/`SIGTERM`, `uncaughtException`, `process.exit` — with a `SIGTERM`→`SIGKILL` fallback so a packaged build never orphans a Node process. The `SIGKILL` timer only fires while the event loop is alive, so `before-quit` must `event.preventDefault()` and resume the quit from the child's `exit` (with a hard-cap `app.exit`) — otherwise the main process exits first and orphans a server that ignored `SIGTERM`. For the same reason, in `window-all-closed` only `stopServer()` on macOS (the app stays alive); elsewhere call `app.quit()` and let `before-quit` run the coordinated shutdown — killing the server here first nulls `serverProcess` and turns `before-quit` into a no-op. The fatal paths that stop the loop *immediately* (`uncaughtException`, `process.on("exit")`) can't wait for that deferred `SIGKILL` either — kill the child **synchronously** there (`forceKillServer`); the standalone server is stateless (state lives in the browser), so a hard kill loses nothing.
- Hold a single-instance lock (`app.requestSingleInstanceLock()`): one app = one server; a second launch just focuses the window.
- In `electron/dev.mjs`, `npm run dev` / `npx electron` spawn the real process as a grandchild, so a plain `child.kill()` orphans `next dev` (it keeps port 3000 across restarts). Spawn each `detached` on POSIX and tear it down with `process.kill(-child.pid, …)` (a `killTree` helper); also handle `SIGHUP` (the new session no longer receives the terminal's hang-up) and Electron's `error` event (a launch failure emits `error`, never `exit`, and would hang the script). Unset `ELECTRON_RUN_AS_NODE` before spawning Electron — Cursor's shell sets it and breaks the main process. Dev loads `http://127.0.0.1:3000`; keep `allowedDevOrigins: ["127.0.0.1"]` in `next.config.ts` or HMR is blocked and the UI never hydrates (buttons look fine but do nothing).
- `createWindow` is async (it awaits the server), so guard it with an in-flight flag — a dock-click `activate` during startup would otherwise spawn a second server and orphan one. On startup failure, `dialog.showErrorBox` before quitting instead of vanishing silently.
- `waitForServer` (in both `main.mjs` and `dev.mjs`) must fast-fail when the spawned server process exits — or fails to spawn at all (an ENOENT-style failure emits `error`, never `exit`, so also track a spawn-error flag) — instead of polling until the timeout. The packaged `getFreePort()` port can be taken between probe and the server's bind (it then exits with `EADDRINUSE`); retry the spawn once on a fresh port so a transient collision self-heals rather than hard-failing the launch.
- Guard `will-navigate`, not just `setWindowOpenHandler`: a plain link in a reply navigates the *current* window and would replace the app with an external page. Allow same-origin navigations (compare `new URL(target).origin`), `preventDefault` the rest, and hand http/https off to `shell.openExternal`.
- Self-heal the window: reload once on a non-clean `render-process-gone` and on a main-frame `did-fail-load`, sharing **one** rate-limit timestamp (a repeat within ~10s shows an error / gives up) so the two paths can't loop and drain the battery. Ignore `did-fail-load` subframe failures and ERR_ABORTED (`-3`) — the code emitted when `will-navigate` cancels an external link.
- Battery: keep `backgroundThrottling: true` and push a `power-mode` IPC signal (on-battery / hidden / minimized / blurred / screen-locked / suspended) that `electron/preload.js` turns into a `.low-power` class on `<html>`; `lock-screen`/`suspend` do **not** blur the window on AC power, so fold them into the low-power decision via an idle flag — wiring them as `powerMonitor` listeners is a no-op if the formula only checks battery/visibility/focus (a plugged-in Mac would keep compositing blur for a locked screen). gate GPU-heavy effects (glass `backdrop-filter`) and infinite CSS animations (the stream-cursor `animate-pulse`) behind it — Chromium only auto-throttles RAF and CSS animations when *hidden*, not when blurred-but-visible, so both must be cut manually. Renderer code may read that class to throttle JS too — `use-chat` coalesces stream re-renders from one-per-animation-frame (~60fps) to ~10fps in low-power. Only re-send `power-mode` when the value changes (a fresh value on every blur/focus/powerMonitor tick would force needless renderer style recalcs), but reset that cache on `did-finish-load` so a reloaded page re-syncs. Avoid `powerSaveBlocker` for idle UI and any polling that wakes the CPU. On macOS, set `NSSupportsAutomaticGraphicsSwitching: true` via `build.mac.extendInfo` so a dual-GPU MacBook keeps Open Chat on the integrated (low-power) GPU instead of spinning up the discrete one — the chat UI never needs it.
- macOS frameless chrome: `titleBarStyle: "hiddenInset"` plus an `.electron-traffic-spacer` in the header (see `globals.css`). Set `--electron-safe-left` / `--electron-chrome-h` as **inline styles on `<html>`** from preload (and refine via `shell-chrome` IPC + `getWindowButtonPosition`), but **also** scope macOS fallbacks under `html.electron-macos` in CSS and re-apply inline vars from preload when `<html style>` changes — Next.js hydration replaces `<html class>` and can wipe inline chrome vars.

### iOS Safari (mobile browser)

- Chat shell is a **flex column** (header → scrollable `main` → composer), not an absolutely positioned composer over messages.
- Keyboard offset comes from `useVisualViewport` (`--keyboard-offset` on `<html>`); safe areas from `viewportFit: cover` + `--safe-*` CSS vars in `globals.css`.
- Composer padding uses `.oc-composer-pad`; message list uses `.oc-chat-scroll` (`overscroll-behavior: contain`).
- Secondary actions use `touchVisible` / `touchVisibleItem` (`coarse:` variant) — never `group-hover` only. Composer textarea stays ≥16px on mobile (`text-base`, `md:text-[0.95rem]`) to avoid input zoom.
- Tap targets bump to 44px on coarse pointers (`coarse:size-11`). Dialog open locks `document.body` overflow for iOS scroll bleed.

---

## Code style

### File headers

Core modules use a short banner comment describing responsibilities and constraints. Match this when adding substantial files:

```ts
// ─────────────────────────────────────────────────────────────────────────────
//  useChat — the entire client-side chat engine in ~110 lines.
//  …
// ─────────────────────────────────────────────────────────────────────────────
```

### React

- `"use client"` only where needed (hooks, browser APIs, event handlers)
- Prefer custom hooks in `src/hooks/` over bloated components
- Use `useRef` for values read inside async/stream callbacks to avoid stale closures
- Memoize expensive render paths (see `src/components/markdown.tsx`, `message.tsx`)
- During streaming, pass `defer` to `Markdown` so `useDeferredValue` keeps react-markdown/KaTeX off the hot path; token UI flushes stay RAF-batched in `use-chat.ts`
- Heavy client chunks (markdown stack, settings dialog) must use `next/dynamic` with `ssr: false`
- Stream token updates in `use-chat.ts` are RAF-batched; persist conversations only on flush (send start / stream end), not per token

### TypeScript

- Strict types; avoid `any`
- Small exported types in `src/lib/types.ts` or next to the module that owns them
- Pure functions in `src/lib/` — no React imports in lib files

### Styling

- Tailwind v4 + design tokens in `src/app/globals.css`
- `cn()` for conditional classes
- New shadcn components: follow `components.json` (`base-nova` style, `@/` aliases)
- Icons: inline SVGs in `src/components/icons.tsx`

### IDs

Use the existing lightweight pattern (duplicated intentionally — not worth a shared util):

```ts
`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
```

### Comments

Code should mostly explain itself. Comment non-obvious business logic, streaming protocol details, and provider quirks — not every line.

---

## Streaming protocol

- **Plain text stream:** default; each chunk is `delta.content` UTF-8
- **NDJSON stream** (`Content-Type: application/x-ndjson`): one JSON object per line: `{ "p": "content" | "reasoning", "t": "…" }`, `{ "p": "tool_call", "id", "name", "arguments" }` when memory tools are enabled, or `{ "p": "usage", "prompt", "cached", "written" }` after the stream when prompt caching is on
- Client parsing lives in `use-chat.ts`; server encoding in `chat/route.ts`
- Do not introduce a third framing format without strong reason

---

## Secrets and config

- Real keys in `.env.local` only (see `.env.example`)
- Never commit `.env` or `.env.*` (except `*.example` templates)
- `OPENROUTER_API_KEY` is server-only; browser talks only to `/api/*`
- User-supplied keys in settings are sent to API routes, not stored in repo

---

## What to build vs leave out

**In scope for small, focused PRs:** provider options, attachment types, reasoning UI, title generation, settings panels, markdown improvements.

**Intentionally missing** (add only when asked): auth, multi-user DB, tool calling, rate limiting, analytics, i18n, test harnesses.

Do not add tests unless requested or they cover real non-trivial behavior.

---

## Making changes

1. Read the files you are touching end-to-end before editing.
2. Match naming, imports (`@/…`), and patterns in neighboring code.
3. Keep files short — if a file grows past ~200 lines, consider whether logic belongs in `src/lib/`.
4. One feature per change; no drive-by refactors.
5. Run `npm run build` to verify TypeScript + Next compile when making non-trivial edits.

---

## Self-improvement (update this file)

`AGENTS.md` is a living document. **If you make a mistake — or nearly make one — that is likely to recur and could be prevented by a short convention, update `AGENTS.md` in the same change** (or immediately after fixing the bug).

### When to add a rule

- You violated an existing project pattern (wrong file, wrong abstraction, added a dependency we avoid).
- You had to reverse course after learning something non-obvious about this codebase (Next.js 16 quirks, streaming protocol, provider API shape, hydration timing, etc.).
- A review or build failure revealed a repeatable trap future agents would hit without guidance.
- The fix is general — not tied to one ticket, one variable name, or one-off data.

### When not to add a rule

- One-time typos or isolated bugs with no broader lesson.
- Task-specific requirements the user gave for a single PR.
- Restating what is already documented — edit the existing bullet instead of duplicating.
- Long narratives, stack traces, or file-specific playbooks (keep rules short).

### How to write updates

1. Put the rule in the **most relevant section** (Dependency policy, Architecture, Code style, …). Add a new subsection only if nothing fits.
2. State **what to do** (or avoid) in one or two sentences — imperative, concrete.
3. Optionally add a **why** clause when the reason is not obvious.
4. Keep the file scannable; prefer tightening existing text over growing without bound.

Example (good):

> When adding a server route that calls OpenRouter, resolve the API key server-side from env or request body — never import user settings modules that assume `window`.

Example (too much):

> Do not use `useSettings` in `route.ts` because on 2025-06-21 we saw error X when …

### After updating

- Mention the `AGENTS.md` change briefly in your summary so the user knows the doc evolved.
- Do not ask permission for small, clearly general additions — just add them.
- If unsure whether a lesson is general enough, prefer adding a concise rule over leaving future agents to rediscover the same mistake.

---

## Quick reference

| Task | Start here |
| --- | --- |
| Change streaming behavior | `src/hooks/use-chat.ts`, `src/app/api/chat/route.ts` |
| iOS browser layout / keyboard | `src/components/chat/chat.tsx`, `src/hooks/use-visual-viewport.ts`, `src/app/globals.css` |
| Add / change provider | `src/app/api/chat/route.ts`, `src/lib/ai-completion.ts` |
| Conversation list / titles | `src/hooks/use-conversations.ts`, `src/lib/generate-title.ts` |
| Sidebar open / docked layout | `src/hooks/use-sidebar-open.ts`, `src/components/chat/sidebar.tsx`, `src/components/chat/chat.tsx` — docked on `md+` with persisted open state (`openchat:sidebar-open`); mobile stays overlay drawer |
| User settings | `src/hooks/use-settings.ts`, `src/lib/storage.ts` |
| Agent memory | `src/hooks/use-memories.ts`, `src/lib/memory-tools.ts`, `src/components/chat/memory-settings.tsx` — localStorage `openchat:memories`; injected via `buildSystemPrompt`; main model gets `save_memory` tool when enabled **and** `ModelCapabilities.tools`; client executes tool, follow-up round in `use-chat.ts`. Check `saveMemories` return value — never report saved on quota failure. Single eviction policy in `storage.ts` (`capMemories`: agent entries evicted before user at cap). Gate send on memory/settings hydration; listen for `storage` events on `openchat:memories` for multi-tab sync. |
| Attachment blobs (IDB) | `src/lib/attachment-store.ts`, `src/hooks/use-attachment-blob.ts` |
| Assistant message rendering | `src/components/markdown.tsx`, `src/components/chat/message.tsx` |
| Attachments | `src/lib/attachments.ts`, `src/hooks/use-attachments.ts` |
| Reasoning display | `src/lib/reasoning.ts`, `src/components/chat/reasoning-panel.tsx` |
| Context window / usage meter | `src/lib/model-capabilities.ts`, `src/lib/estimate-context.ts`, `src/components/chat/context-usage.tsx` |
| Prompt caching (OpenRouter) | `src/lib/prompt-cache.ts`, `src/app/api/chat/route.ts`, settings → `promptCaching` |
| Electron desktop build | `electron/main.mjs`, `electron/prepare-standalone.mjs`, `package.json` `build` field — list `standalone/node_modules` as its own `extraResources` entry or electron-builder skips it |
