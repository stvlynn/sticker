# Sticker agent stack

This document explains the agent-facing interfaces built on top of the Lynn-chan sticker library:
a canonical catalog, a REST API, an MCP server, and a DeepSeek Harness bundle that renders stickers
inline in a conversation.

## What is included

```
public/stickers/*.png                 80 static sticker PNGs
public/stickers/animated/*           181 animated WebM stickers + poster PNGs
src/data/animated-stickers.json      published animated manifest

packages/sticker-catalog             canonical catalog.json, matcher, query helpers, WebP stills
packages/sticker-api                 zero-dependency REST API (:4319) + MCP-over-HTTP at /mcp
packages/sticker-mcp                 zero-dependency MCP stdio server
packages/dsh-sticker                 installable DeepSeek Harness bundle (tool + inline view)
packages/dsh-sticker-mcp-bundle      optional DSH MCP connection bundle (not installed by default)

scripts/verify-sticker-stack.mjs     end-to-end verification
scripts/package-dsh-plugin.mjs       plugin tarball builder
public/catalog.json                  deployed metadata for the plugin's remote refresh
```

## Build everything

```bash
npm run stickers:build
```

This runs three steps:

1. `packages/sticker-catalog/src/build.mjs` — regenerates `catalog.json` (261 entries: 80 static,
   181 animated) from the actual assets and the hand-curated mood metadata, and writes the same
   document to `public/catalog.json` for the plugin's remote refresh.
2. `packages/sticker-catalog/src/build-assets.mjs` — creates 256px WebP stills for all 261
   stickers under `packages/sticker-catalog/assets/thumbs/` for the MCP server.
3. `packages/dsh-sticker/scripts/build-catalog.mjs` — writes the DSH bundle's metadata-only
   `lib/catalog.json` (id/title/type/tags/moods/site paths). It bundles no media.

Prerequisites: Node.js 24+ and `cwebp` (`brew install webp`) for the MCP stills. `ffmpeg` is no
longer needed by the DSH plugin.

## Canonical catalog

`packages/sticker-catalog/catalog.json` is the single source of truth. Each entry contains:

| Field | Meaning |
|---|---|
| `id` | Stable id (`s-01`…`s-80`, `a-001`…`a-181`) |
| `title` | Display title from the PNG filename or the animated manifest |
| `type` | `static` or `animated` |
| `tags` | Bilingual mood tags used by the matcher |
| `moods` | Short phrases a model is likely to pass |
| `aliases` | Extra search terms |
| `whenToUse` | One-line human documentation |
| `source` | Repo-relative original file |
| `image` / `video` | Root-relative web paths (or `null`) |
| `pack` / `position` | Animated Telegram pack provenance |

The catalog is generated and committed; it is **never injected into model context** by the DSH
bundle. Only the matcher's compact result is used.

## REST API

Start:

```bash
npm run stickers:api
# lynn-sticker api listening on http://127.0.0.1:4319
```

| Endpoint | Description |
|---|---|
| `GET /health` | `{ ok, static, animated, total }` |
| `GET /api/catalog` | Full catalog |
| `GET /api/stickers?q=&type=&tag=&limit=&offset=` | Search/filter/paginate; `q` ranks by match score |
| `GET /api/stickers/:id` | One sticker + absolute media URLs |
| `GET /api/tags` | Tag vocabulary with counts |
| `GET /api/random?mood=&type=` | One best-match or random sticker |
| `GET /stickers/*` | Original PNG/SVG/WebM bytes; supports `Range` for WebM |
| `POST /mcp` | MCP Streamable HTTP (JSON responses) |

Examples:

```bash
curl -s "http://127.0.0.1:4319/api/stickers?q=%E6%91%B8%E9%B1%BC&limit=3" | jq
curl -s "http://127.0.0.1:4319/api/random?mood=%E5%8A%A0%E7%8F%AD" | jq
curl -s -o sticker.png "http://127.0.0.1:4319/stickers/%E6%91%B8%E9%B1%BC.png"
```

## MCP server

Start the stdio server (`npm run stickers:mcp`) and configure it in any MCP-capable agent:

```json
{
  "mcpServers": {
    "lynn-sticker": {
      "command": "node",
      "args": ["/Users/steven/code/sticker/packages/sticker-mcp/server.mjs"]
    }
  }
}
```

Tools:

| Tool | Returns |
|---|---|
| `search_stickers` | Compact text rows (`id \| title \| type \| tags`), no images |
| `get_sticker` | Text metadata + one small WebP image |
| `random_sticker` | Text metadata + one small WebP image |
| `list_sticker_tags` | Tag vocabulary with counts |

For a DeepSeek Harness profile that wants MCP instead of the direct bundle, start the API server
(`npm run stickers:api`) and install `packages/dsh-sticker-mcp-bundle`. It connects to
`http://127.0.0.1:4319/mcp` as server name `lynn_sticker`. This is optional: MCP tool schemas add
to every request, so the direct sticker bundle is the context-cheap path for DSH agents.

## DeepSeek Harness bundle

Install from npm or from the local directory through the Plugin Manager:

```text
plugin_manager install_bundle target=dsh-lynn-sticker@1.0.0
# or
plugin_manager install_bundle target=/Users/steven/code/sticker/packages/dsh-sticker
```

The package is intentionally tiny (~68 KB tarball): it ships only the host/client code, the
metadata catalog, icon, locales and LICENSE. **No sticker images or WebM loops are packaged.**

The bundle registers:

- `send_sticker({ mood, id? })` — resolves the best sticker server-side. A mood phrase is enough;
  `id` selects an exact sticker from a previous result.
- A one-paragraph prompt hint asking the model to use stickers sparingly (at most one per turn).
- A browser `tool.call.toolview` that renders the sticker inline from `tool/result.meta`, loading
  the image/WebM directly from `https://sticker.stv.pm`.

### Remote media and catalog

The host builds absolute URLs from `LYNN_STICKER_BASE_URL` (default `https://sticker.stv.pm`):

- static: `https://sticker.stv.pm/stickers/<name>.png`
- animated: poster `…/stickers/animated/<name>.png`, loop `…/stickers/animated/<name>.webm`

It fetches `${LYNN_STICKER_BASE_URL}/catalog.json` in the background at activation and on a tool
call when the cached metadata is older than the TTL (default **5 minutes**, override with
`LYNN_STICKER_CATALOG_TTL_MS`), replacing the bundled metadata when the response is valid. The
bundled `lib/catalog.json` is the offline fallback. Updating images on the site needs no plugin
release; updating `public/catalog.json` makes new or retagged stickers available without a plugin
release.

The production site serves every sticker asset and `/catalog.json` (261 entries), so the TTL
refresh is live.

### Context cost

| Item | Approximate size |
|---|---|
| Tool schema + description | ~150 tokens |
| Prompt hint | ~70 tokens |
| One send result | ~15 tokens |
| Sticker image / video / catalog metadata | 0 tokens (not sent to the model) |

A second send in the same turn returns `Sticker skipped: already sent a sticker this turn.` and
renders nothing.

### Packaging

```bash
npm run stickers:pack
# dist/dsh-lynn-sticker-1.0.0.tgz
```

The packaging script fails if the tarball bundles any sticker media or references a non-site
relative path. The result is about 68 KB and contains both halves, the manifests, the metadata
catalog, the icon, locales and LICENSE.

## Verification

```bash
npm run stickers:verify
```

It checks the catalog counts and metadata, the shared MCP stills, the metadata-only DSH package
(no `lib/assets`), `public/catalog.json`, live media URLs on `sticker.stv.pm`, the REST endpoints
(including Range and path traversal), the MCP stdio handshake and image result, and HTTP `/mcp`.
`/catalog.json` is live on the production site and checked by the verification suite.

## License

Sticker artwork: **CC BY 4.0**, by Steven Lynn and contributors; keep the attribution when
redistributing. The plugin icon is derived from `public/stickers/mhy.png`. See the repository
[README](../README.md) and [LICENSE](../LICENSE).
