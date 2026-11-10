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
- [x] 4.2 Implement `lib/index.js`: `send_sticker` tool, one-line render, absolute site media URLs in presentation meta, prompt hint, per-turn soft limit, background remote catalog refresh.
- [x] 4.3 Implement `lib/client.js`: `tool.call.toolview` registration and inline still/animated sticker rendering with reduced-motion handling and disposal.
- [x] 4.4 Implement `scripts/build-catalog.mjs`: metadata-only `lib/catalog.json` (no bundled media) plus `public/catalog.json` for the remote refresh.
- [x] 4.5 Implement `scripts/package-dsh-plugin.mjs` and produce an installable tarball (~72 KB, no media).

## 5. Verification and docs
- [x] 5.1 Implement `scripts/verify-sticker-stack.mjs` covering catalog, MCP stills, metadata-only plugin, public catalog, live remote media, API, MCP and plugin syntax.
- [x] 5.2 Add root npm scripts and `docs/sticker-agent-stack.md` with install, MCP config, API reference and context budget.
- [x] 5.3 Run `npm run stickers:verify`, `npm run build`, `npx tsc --noEmit` and fix regressions.
- [x] 5.4 Install the bundle with `plugin_manager install_bundle`, verify `send_sticker` registration and call it once in a live session.

## Verification results

- Catalog: `node packages/sticker-catalog/src/build.mjs` → 261 stickers (80 static, 181 animated),
  unique ids/titles, all source files present, all entries >=2 tags and >=1 mood; the same document
  is written to `public/catalog.json`.
- Shared stills: `node packages/sticker-catalog/src/build-assets.mjs` → 261 WebP stills, 3.39 MB,
  all files pass the RIFF/WEBP header check (MCP-only).
- DSH metadata: `node packages/dsh-sticker/scripts/build-catalog.mjs` → 261 metadata entries,
  119.4 KB, no bundled media; every entry uses site-relative `image`/`video` paths.
- `node scripts/verify-sticker-stack.mjs` → 73 checks passed, 0 failed, 0 skipped (catalog, shared
  stills, metadata-only bundle, public catalog, REST endpoints, Range, path traversal, MCP stdio,
  HTTP `/mcp`, live `sticker.stv.pm` PNG/WebM and the deployed `/catalog.json`).
- `npx tsc --noEmit` → pass.
- `npm run build` → Next 14 production build pass.
- `npm run stickers:pack` → `dist/dsh-lynn-sticker-1.1.0.tgz`, 72 KB, 10 entries, 261 metadata
  entries, no `lib/assets` and no bundled media.
- Live DSH: `plugin_manager install_bundle packages/dsh-sticker` → `application: applied`;
  `cordis_inspect_query` confirms the `send_sticker` tool schema, the browser
  `tool.call.toolview` occupant and the `lynn-sticker-turn-tail` entry in
  `conversation.chat.turnTail`; a live call returned `Sent sticker "干饭".` with
  `meta.thumb = https://sticker.stv.pm/stickers/%E5%B9%B2%E9%A5%AD.png` and no image in
  model-facing content.
- Remote catalog refresh uses a 5-minute TTL (at activation and on tool calls, configurable via
  `LYNN_STICKER_CATALOG_TTL_MS`); the bundled metadata remains the offline fallback.
- Remote media verified live: `sticker.stv.pm/stickers/干饭.png` → 200 `image/png`;
  `…/stickers/animated/001-Alert-Bits.webm` → 200 `video/webm`.
- The old plugin package asset route now returns 404 for `/plugins/dsh-lynn-sticker/assets/...`,
  confirming no media is bundled or served by the plugin.
