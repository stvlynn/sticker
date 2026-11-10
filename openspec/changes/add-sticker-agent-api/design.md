# Design: Sticker agent stack

## Context

The repo is a Next.js gallery over 80 static PNG stickers (`public/stickers/*.png`) and 181
animated Telegram stickers (`public/stickers/animated/*.webm` plus poster PNGs and
`src/data/animated-stickers.json`). The request is to turn the library into an API that agents
can load through MCP and as a DeepSeek Harness (DSH) bundle, so an agent can send a sticker at a
fitting moment in conversation while keeping model context small.

## Goals

- One generated source of truth for all 261 stickers: stable id, title, type, bilingual mood
  tags, source paths, animated metadata.
- A REST API and an MCP server with no runtime npm dependencies.
- A DSH bundle with a model-facing `send_sticker` tool and a browser view that renders the
  sticker inline in the transcript.
- Context discipline: the catalog is never injected; one compact tool schema, one short prompt
  hint, and one-line tool results are the only model-visible cost.
- Reproducible assets and a packaged, installable plugin tarball.
- No changes to existing gallery behaviour.

## Non-Goals

- No image generation, editing, or upload.
- No custom session event types (the durable `tool/result` event is enough).
- No web UI gallery redesign.
- No publishing to npm or dsh.fish from this change.
- No dependency on the Next.js server for the DSH plugin or MCP server.

## Architecture

```
public/stickers/**.png|.webm    src/data/animated-stickers.json
                │
                ▼
packages/sticker-catalog  ── catalog.json (261 entries, canonical)
        │                     │
        │                     ├── packages/sticker-api   REST :4319
        │                     ├── packages/sticker-mcp   MCP stdio (+ optional HTTP)
        │                     └── packages/dsh-sticker   DSH bundle
        │                              ├── lib/catalog.json (runtime lookup)
        │                              ├── lib/assets/thumbs/*.webp
        │                              └── lib/assets/anim/*.webm
        ▼
scripts/verify-sticker-stack.mjs    scripts/package-dsh-plugin.mjs
```

The DSH bundle is self-contained for rendering: it never calls the REST API at runtime. The API
and MCP server are the external access path for other agents and tools.

## Canonical catalog

`packages/sticker-catalog/catalog.json`:

```json
{
  "version": 1,
  "generatedAt": "ISO-8601",
  "counts": { "static": 80, "animated": 181, "total": 261 },
  "stickers": [
    {
      "id": "s-01",
      "title": "007",
      "type": "static",
      "tags": ["加班", "工作", "打工", "overtime"],
      "moods": ["加班", "工作狂", "忙"],
      "whenToUse": "用户提到加班、工作强度或打工日常",
      "source": "public/stickers/007.png",
      "image": "/stickers/007.png",
      "video": null,
      "aliases": ["007", "overtime", "加班"]
    },
    {
      "id": "a-001",
      "title": "Alert Bits",
      "type": "animated",
      "tags": ["alert", "warning", "attention", "提醒", "注意"],
      "moods": ["提醒", "注意", "警报"],
      "whenToUse": "需要提醒、警示或引起注意时",
      "source": "public/stickers/animated/001-Alert-Bits.webm",
      "image": "/stickers/animated/001-Alert-Bits.png",
      "video": "/stickers/animated/001-Alert-Bits.webm",
      "pack": 1,
      "position": 1,
      "aliases": ["alert", "attention", "注意", "提醒"]
    }
  ]
}
```

Rules:
- Static ids are `s-NN` in `public/stickers` PNG name order (includes unregistered `多喝水.png`) (the order in
  `src/data/stickers.ts`); animated ids are `a-NNN` in manifest order. IDs are stable until the
  source list order changes.
- Every entry must have at least two non-empty `tags` and at least one `moods` entry. The build
  script fails otherwise.
- `tags` are bilingual where useful; `moods` are the short phrases the matcher scores.
- `source`/`image`/`video` are repo-relative/web paths; no absolute machine paths.
- Curated metadata lives in `packages/sticker-catalog/src/curated.mjs`. The 80 static stickers
  get hand-written Chinese tags, English aliases and a one-line `whenToUse`. Animated titles are
  tokenized from the manifest title; common animated titles get hand-written overrides.
- Generated `catalog.json` is committed so the API/MCP/site can read it without a build step.

## Matching

`packages/sticker-catalog/src/match.mjs` exports `matchSticker(catalog, query, options)`.

- Normalize query: lowercase, unify punctuation/whitespace, keep CJK.
- Score `id` exact (1000), title exact (600), title contains (350), alias exact (450),
  alias contains (250), mood exact (300), mood contains (180), tag exact (200), tag contains
  (90). Longer matched terms score higher (add `len * 2`). Static and animated compete equally.
- Optional `type` filter. Return `{ match, candidates }`, where `candidates` is the top 5 compact
  entries used in no-match diagnostics.
- Deterministic tie-break: higher score, then catalog order.

## REST API (`packages/sticker-api`)

Zero-dependency `node:http` server, default `127.0.0.1:4319`, `PORT`/`HOST` overridable.

- `GET /health` → `{ ok: true, total: 261 }`
- `GET /api/stickers?q=&type=static|animated&tag=&limit=20&offset=0` →
  `{ ok, total, count, offset, items }`; `q` uses the matcher and sorts by match score when set.
- `GET /api/stickers/:id` → `{ ok, sticker }`; 404 `{ ok:false, error }`.
- `GET /api/tags` → `{ ok, tags: [{ tag, count }] }` sorted by count desc.
- `GET /api/random?mood=` → one sticker; with `mood`, best match; without, uniform random.
- `GET /api/catalog` → full catalog (no absolute URLs).
- `GET /stickers/...` → original PNG/SVG/WebM bytes from `public/stickers` with correct
  `content-type`, immutable cache, and path-traversal rejection.
- CORS `Access-Control-Allow-Origin: *`, `OPTIONS` 204. JSON responses use absolute
  `imageUrl`/`videoUrl` built from the request host; keep repo-relative `image`/`video` too.

## MCP server (`packages/sticker-mcp`)

Zero-dependency MCP server, newline-delimited JSON-RPC 2.0 over stdio by default, optional
`--http [port]` for a minimal Streamable HTTP `/mcp` endpoint. stdout carries protocol frames
only; logs go to stderr.

- `initialize`: return the client's supported version when it is one of
  `2025-06-18`, `2025-03-26`, `2024-11-05`; otherwise `2025-06-18`. Capabilities:
  `{ tools: { listChanged: false } }`. `serverInfo: { name: "lynn-sticker", version }`.
- `notifications/initialized`: no response.
- `ping`: `{}`.
- `tools/list`:
  - `search_stickers` — `{ query: string, type?: "static"|"animated", limit?: number }` →
    text line per sticker: `<id> | <title> | <type> | <tags joined by ",">` plus a total line.
  - `get_sticker` — `{ id: string }` → text metadata + one image content block
    `{ type: "image", data: base64(webp), mimeType: "image/webp" }` of the 256px still.
  - `random_sticker` — `{ mood?: string, type? }` → same shape as `get_sticker`.
  - `list_sticker_tags` — `{}` → text tag counts.
- `tools/call` returns `{ content, isError?: true }`; unknown tool → JSON-RPC error -32602.
- Images are only returned by `get_sticker`/`random_sticker`, never by `search_stickers`.
- MCP reads the canonical catalog and the shared 256px stills generated by the catalog build
  (`../sticker-catalog/assets/thumbs/...`).
- `packages/sticker-mcp/protocol.mjs` owns the transport-independent JSON-RPC handler so the
  stdio server and the HTTP REST server share one implementation.
- `packages/sticker-api/server.mjs` also serves `POST /mcp` (JSON responses, `Mcp-Session-Id` on
  initialize, `DELETE /mcp` → 204, `GET /mcp` → 405) so the DSH MCP bundle can use a portable
  `http://127.0.0.1:4319/mcp` endpoint.
- `packages/dsh-sticker-mcp-bundle/` is an optional config-only bundle that inserts
  `@deepseek-ai/dsh-mcp-client` with `serverName: lynn_sticker`, `transport: streamable-http`,
  `url: http://127.0.0.1:4319/mcp`, `failOnStartupError: false`. It is **not** installed by
  default; the direct DSH sticker bundle is the context-efficient path. Installing both is
  allowed but adds MCP tool schemas to every request.

## DSH bundle (`packages/dsh-sticker`)

Install target: `plugin_manager install_bundle` with the absolute package directory. Package
name `dsh-lynn-sticker`, row id `lynn-sticker`.

### Files

```
package.json           exports ".", "./client", "./assets/*", "./locale/*.json", "./icon"
cordis.patch.yml       inserts row { id: lynn-sticker, name: dsh-lynn-sticker }
icon.png               <=256 KiB, derived from public/stickers/mhy.png (CC BY 4.0)
locale/en.json         meta.title / meta.description
locale/zh.json         meta.title / meta.description
lib/index.js           host half: catalog load, matcher, tool, prompt hint, media route
lib/client.js          browser half: window.__ModuleLoader__ factory + tool view
lib/catalog.json       generated runtime catalog (id/title/type/tags/moods/thumb/video)
lib/assets/thumbs/*.webp  generated 256px stills for all 261
lib/assets/anim/*.webm    generated 240px loops for animated stickers
scripts/build-assets.mjs  regenerates catalog + assets + plugin catalog
README.md              install, usage, license/attribution
```

`package.json`:

```json
{
  "name": "dsh-lynn-sticker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./assets/*": "./lib/assets/*",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.png",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "locale/*.json", "icon.png", "README.md", "scripts"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-tool", "@deepseek-ai/dsh-client-ui-conversation"]
    }
  }
}
```

### Host half (`lib/index.js`)

Reference APIs (installed DSH 0.2.2-rc.1; source copy at `/tmp/dsh-src`):

- `packages/core/tools/src/schema.ts` — `defineTool({ name, description, parameters, output:
  { schema, render, presentationMeta? }, execute })`. `output.presentationMeta(args, value)` is
  persisted on `tool/result` as `meta`, visible to Client renders and **not** model-visible.
- `packages/core/system-prompt/src/index.ts` — `ctx.systemPrompt.section({ name, order, text })`,
  `ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH')`.
- `packages/host/webserver/src/index.ts` — `ctx.webServer.register({ kind:'prefix', path,
  handler })`; `ctx.effect(() => ctx.webServer.register(...))`.
- `packages/core/agent/src/types.ts` — `ctx.agents.turnBoundaryOf(session).lastTurn`.
- A profile-installed external bundle does **not** resolve shipped `@deepseek-ai/*` packages from
  the DSH installation (verified: `Cannot find package '@deepseek-ai/dsh-tools'`). Therefore the
  host half must hand-write the plain `ToolDefinition` object (`name`, `description`,
  `parameters`, `output: { schema, render, presentationMeta }`, `execute`, `presentCall`) and
  register it with `ctx.tools.register(definition)`. The registry only requires a supported raw
  JSON Schema for `output.schema` and callable `render`/`presentationMeta`; emulate the compiled
  shape from `defineTool` (see `packages/core/tools/src/schema.ts:450`). Add no dependencies.
- External **client** bundles may only `require('react')` and other baseline browser modules;
  do not require Harness Client packages or `@deepseek-ai/dsh-client-ui-primitives`.

Behaviour:

```js
export const name = 'lynn-sticker'
export const inject = ['tools', 'systemPrompt']
export function apply(ctx, config) { ... }
```

1. Read `lib/catalog.json` with `readFileSync(new URL('./catalog.json', import.meta.url))`.
2. Register `send_sticker`:
   - parameters: `mood` (string, required, short Chinese/English mood/scene phrase; description
     says it is matched server-side) and `id` (string, optional, exact id from a previous
     result).
   - output schema: `{ sent, id, title, type, reason }` (all required; strings and boolean).
   - `render`: sent → `[{ type:'text', text: 'Sent sticker "<title>".' }]`; skipped →
     `[{ type:'text', text: 'Sticker skipped: <reason>.' }]`. Keep both one line.
   - `presentationMeta`: sent → `{ id, title, type, thumb, video, sent: true }` where `thumb` is
     `plugins/dsh-lynn-sticker/assets/<thumb>` and `video` is `/lynn-sticker-media/<file>` only
     when the media route registered (animated only); skipped → `{ sent: false }`.
   - `execute`: resolve exact id first, else `matchSticker`. If no match, throw an Error whose
     message lists up to 4 `id — title` candidates. Enforce at most one successful send per
     current turn via `ctx.get('agents')?.turnBoundaryOf(exec.agent.session).lastTurn`; on the
     second call return `{ sent:false, reason:'already sent a sticker this turn' }` with empty
     id/title. If called without an owning agent, allow it (no turn key).
   - `presentCall`: `{ card:'generic', title:'Send sticker', kind:'other', rawInput:{ mood } }`.
   - Do not return images or data URLs.
3. Register the prompt hint at order
   `ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH')`, text provider that checks
   `ctx.tools.get('send_sticker', scope)` is present:
   `Lynn stickers: when the user's moment is emotional or playful (thanks, greeting,
   celebration, frustration, a funny failure, a break), you may call send_sticker with a short
   mood phrase. At most one per turn; never let a sticker replace a substantive answer, and skip
   it for routine or serious tasks.`
4. If `webServer` is available (`ctx.inject(['webServer'], cb)`), register prefix
   `/lynn-sticker-media` that serves only `/^[a-z0-9-]+\.webm$/` from `lib/assets/anim` with
   `video/webm`, correct `content-length`, immutable cache. 404 on anything else, 405 on
   non-GET/HEAD. No path traversal is possible; validate the joined path stays inside the dir.

### Browser half (`lib/client.js`)

Hand-written external client module in the documented format:

```js
window.__ModuleLoader__.load({
  id: 'dsh-lynn-sticker',
  factory(require) {
    const React = require('react')
    // component + apply
    return { inject: ['slots'], apply(ctx) { ... } }
  },
})
```

- In `apply`, inject one `<style>` element with a `dsh-lynn-sticker-*` class prefix and remove it
  on dispose (`ctx.effect`). Use only `--dsw-alias-*` theme tokens for any chrome; the sticker's
  own artwork carries its colors.
- `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name:
  'tool.call.toolview', key: 'send_sticker' }, StickerView))`.
- `StickerView`:
  - `phase === 'preparing' | 'start'` → render `null` (no flicker before the result).
  - `phase === 'result'`: if `block.isError` or `!block.meta` or `block.meta.sent !== true` →
    render `null`; otherwise render the still `<img>` from `block.meta.thumb` (about 168px wide,
    `alt` = title, rounded, object-fit contain) and, for animated stickers with
    `block.meta.video` and `prefers-reduced-motion: no-preference`, render `<video autoplay loop
    muted playsInline poster={thumb}>` instead, with the still as fallback on error.
  - No text chrome, no caption, no extra imports of Harness Client packages.
  - Respect reduced motion with `matchMedia('(prefers-reduced-motion: reduce)')`.
- The asset URLs are absolute document-relative (`plugins/...`), so no runtime fetch or session
  read is needed.

### Context budget

- Catalog is never in context.
- One tool schema (~150 tokens), one prompt hint (~70 tokens), one result line per send (~15
  tokens), no images in model context.
- Failed match diagnostics are capped at 4 candidates.

### Asset pipeline (`scripts/build-assets.mjs`)

- Uses `cwebp`/`ffmpeg` when present, else Python Pillow (available) for stills; animated loops
  are optional but expected.
- Stills: fit inside 256x256, WebP quality 80, transparent background preserved, file name
  `<id>-<sha1-8>.webp`.
- Animated: scale to width 240, VP9/`libvpx-vp9`, `-b:v 0 -crf 40 -an`, 20 fps, file name
  `<id>-<sha1-8>.webm`; if a conversion fails, log and fall back to the still (catalog `video`
  null). Total asset budget target < 20 MB; fail the build if exceeded.
- Writes `lib/catalog.json` with `{ version, stickers: [{ id,title,type,tags,moods,whenToUse,
  thumb,video }] }`; paths are relative to `lib/assets`.
- Prints counts and byte totals.

### Packaging (`scripts/package-dsh-plugin.mjs`)

- Runs `npm pack --pack-destination <repo>/dist` in `packages/dsh-sticker`.
- Verifies the tarball contains `lib/index.js`, `lib/client.js`, `cordis.patch.yml`, locale,
  icon, `lib/catalog.json`, and every generated asset referenced by the catalog.
- Prints the tarball path and size. Does not publish.

## Verification

`scripts/verify-sticker-stack.mjs`:

1. Catalog: 80 static + 181 animated = 261, unique ids/titles/images, every source exists, every
   entry has >=2 tags and >=1 mood, every URL starts with `/`.
2. DSH assets: catalog count 261, every thumb exists and is non-empty, every animated has a
   video or an explicit still fallback, total size < 20 MB; `node --check lib/index.js` and
   `lib/client.js`.
3. API: start on an ephemeral port, assert `/health`, search `摸鱼`, `type=animated`, lookup,
   tag list, random, original PNG/WebM bytes and 404/path traversal rejection.
4. MCP: spawn stdio server, send `initialize`, `tools/list`, `tools/call search_stickers`,
   `tools/call get_sticker`; assert the image block decodes to a WebP.
5. Print a concise PASS summary; exit non-zero on any failure.

## Risks / trade-offs

- Hand-written MCP protocol may lag newer SDK revisions → negotiate supported legacy versions
  and verify with the installed DSH MCP client; keep the wire format minimal.
- Generated binary assets add repo weight (~10–20 MB) → keep WebP/WebM optimized and the total
  budget enforced.
- The tool view renders inside the tool-call row, not as a message bubble → acceptable inline
  chat presentation; no custom session event type and no context cost.
- pnpm-linked local bundle reads its own repo files → package assets are committed/generated
  before install; the tarball is the portable artifact.
