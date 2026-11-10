## 1. Catalog and assets
- [x] 1.1 Create `packages/sticker-catalog` with curated bilingual mood metadata for all 80 static stickers and tag overrides for animated stickers.
- [x] 1.2 Implement `src/build.mjs` to generate a 261-entry `catalog.json` with stable ids, source paths, tags, moods and `whenToUse`; fail on missing tags/sources.
- [x] 1.3 Implement `src/match.mjs` deterministic bilingual matcher and candidate diagnostics.
- [x] 1.4 Implement `src/query.mjs` filter/search/pagination helpers shared by the API and MCP server.
- [x] 1.5 Implement `src/build-assets.mjs` to generate 256px WebP stills for all 261 stickers under `packages/sticker-catalog/assets/thumbs/` (used by MCP).

## 2. REST API
- [x] 2.1 Implement `packages/sticker-api/server.mjs` with `/health`, `/api/stickers`, `/api/stickers/:id`, `/api/tags`, `/api/random`, `/api/catalog` and `/stickers/*` originals.
- [x] 2.2 Add CORS, correct content types, immutable caching, 404/405 handling and path-traversal rejection.

## 3. MCP server
- [x] 3.1 Implement `packages/sticker-mcp/protocol.mjs` transport-independent JSON-RPC handler and newline-delimited stdio transport with initialize/ping/tools/list/tools/call.
- [x] 3.2 Expose `search_stickers`, `get_sticker`, `random_sticker`, `list_sticker_tags`; images only from `get_sticker`/`random_sticker`.
- [x] 3.3 Serve `POST /mcp` from the API server and add `packages/dsh-sticker-mcp-bundle` (streamable-http, not installed by default); stderr-only logging.

## 4. DeepSeek Harness bundle
- [x] 4.1 Create `packages/dsh-sticker` manifest, patch row, locales, icon and README.
- [x] 4.2 Implement `lib/index.js`: `send_sticker` tool, one-line render, presentation meta, prompt hint, per-turn soft limit, WebM media route.
- [x] 4.3 Implement `lib/client.js`: `tool.call.toolview` registration and inline still/animated sticker rendering with reduced-motion handling and disposal.
- [x] 4.4 Implement `scripts/build-assets.mjs`: WebP stills for all 261, optimized WebM loops for animated, runtime `lib/catalog.json`, size budget enforcement.
- [x] 4.5 Implement `scripts/package-dsh-plugin.mjs` and produce an installable tarball.

## 5. Verification and docs
- [x] 5.1 Implement `scripts/verify-sticker-stack.mjs` covering catalog, assets, API, MCP and plugin syntax.
- [x] 5.2 Add root npm scripts and `docs/sticker-agent-stack.md` with install, MCP config, API reference and context budget.
- [x] 5.3 Run `npm run stickers:verify`, `npm run build`, `npx tsc --noEmit` and fix regressions.
- [x] 5.4 Install the bundle with `plugin_manager install_bundle`, verify `send_sticker` registration and call it once in a live session.

## Verification results

- Catalog: `node packages/sticker-catalog/src/build.mjs` → 261 stickers (80 static, 181 animated),
  unique ids/titles, all source files present, all entries >=2 tags and >=1 mood.
- Shared stills: `node packages/sticker-catalog/src/build-assets.mjs` → 261 WebP stills, 3.39 MB,
  all files pass the RIFF/WEBP header check.
- DSH assets: `node packages/dsh-sticker/scripts/build-assets.mjs` → 261 runtime entries,
  181/181 animated WebM loops, 7.47 MB total, under the 20 MB budget.
- `node scripts/verify-sticker-stack.mjs` → 53 checks passed, 0 failed (catalog, stills, bundle
  manifests/export, REST endpoints, Range, path traversal, MCP stdio, HTTP `/mcp`).
- `npx tsc --noEmit` → pass.
- `npm run build` → Next 14 production build pass.
- `npm run stickers:pack` → `dist/dsh-lynn-sticker-1.0.0.tgz`, 7.39 MB, 452 tar entries,
  261 stickers, every referenced thumb/WebM present.
- Live DSH: `plugin_manager install_bundle packages/dsh-sticker` → `application: applied`;
  `cordis_inspect_query` confirms the `send_sticker` tool schema and the browser
  `tool.call.toolview` occupant for key `send_sticker`; a live `send_sticker` call returned
  `Sent sticker "打工人".` with a tiny durable `meta`
  (`{sent,id,title,type,thumb,video}`) and no image in model-facing content.
- Package asset route verified live: `GET /plugins/dsh-lynn-sticker/assets/thumbs/<file>.webp`
  → 200 `image/webp`; media route `GET /lynn-sticker-media/<file>.webm` → 200 `video/webm` and
  206 for a byte range.
