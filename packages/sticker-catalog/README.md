# @lynn/sticker-catalog

Canonical catalog and matching helpers for the Lynn-chan sticker library.

- `src/build.mjs` regenerates `catalog.json` from the actual PNGs and the animated manifest.
- `src/build-assets.mjs` generates the shared 256px WebP stills used by the MCP server.
- `src/match.mjs` / `src/query.mjs` are pure, dependency-free helpers reused by the API, MCP server
  and the DSH bundle (the bundle inlines the matcher so its tarball is self-contained).

```bash
node packages/sticker-catalog/src/build.mjs
node packages/sticker-catalog/src/build-assets.mjs
```

Counts: 80 static PNG stickers + 181 animated stickers = 261 catalog entries.
