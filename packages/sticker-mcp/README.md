# @lynn/sticker-mcp

Zero-dependency MCP server for the Lynn-chan sticker catalog.

```bash
npm run stickers:mcp
```

The stdio transport uses newline-delimited JSON-RPC 2.0; stdout carries protocol frames only.
Tools: `search_stickers`, `get_sticker`, `random_sticker`, `list_sticker_tags`. Search returns
compact text; only `get_sticker`/`random_sticker` attach one small WebP image.

The API server imports `protocol.mjs` to expose the same handler at `POST /mcp`.
