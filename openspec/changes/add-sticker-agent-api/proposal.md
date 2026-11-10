# Change: Expose the Lynn sticker library to agents as an API, an MCP server, and a DeepSeek Harness plugin

## Why

The repository owns 80 static stickers and 181 animated stickers, but today they are only
browsable through the Next.js gallery. Agents cannot discover them semantically, cannot fetch
them over a stable interface, and cannot play one back into a conversation at a fitting moment.

## What Changes

- Add a generated canonical catalog (`packages/sticker-catalog/catalog.json`) for all 261
  stickers with stable ids, bilingual mood tags, original asset paths and animated metadata.
- Add a zero-dependency REST API server (`packages/sticker-api`) exposing search, lookup,
  tags, random selection and the original static/animated files.
- Add a zero-dependency MCP server (`packages/sticker-mcp`) over stdio (with an optional HTTP
  mode) exposing `search_stickers`, `get_sticker`, `random_sticker` and `list_sticker_tags`.
- Add a DeepSeek Harness bundle (`packages/dsh-sticker`) with:
  - a model-facing `send_sticker` tool that resolves a short mood phrase server-side,
  - a tiny system-prompt hint and a one-sticker-per-turn soft limit,
  - a browser tool-call view that renders the sticker inline in the transcript,
  - optimized package assets (WebP stills + small WebM loops) and localized display metadata.
- Add a packaging script that produces an installable `dsh-lynn-sticker` tarball.
- Add an end-to-end verification script and documentation.
- Do not change existing gallery behaviour; no existing public API is broken.

## Impact

- Affected specs: new capability `sticker-agent-api`; existing `sticker-gallery` is untouched
  (the catalog is generated from the same assets).
- Affected code: new `packages/*` trees, new root npm scripts, new docs, new OpenSpec change.
  No breaking change to `src/`.
- Context cost: the catalog is never injected into model context. Only one compact tool schema,
  a ~55-word prompt hint, and a one-line tool result enter context per call.
