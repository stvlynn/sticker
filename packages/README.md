# Packages

The repository keeps the Next.js gallery at the root and the agent-facing sticker stack under
`packages/`.

| Package | Purpose |
|---|---|
| `sticker-catalog` | Canonical `catalog.json`, bilingual matcher, query helpers, shared 256px WebP stills. |
| `sticker-api` | Zero-dependency REST API on `127.0.0.1:4319`, original media with Range, and `POST /mcp`. |
| `sticker-mcp` | Zero-dependency MCP stdio server (tools + optional HTTP handler shared with the API). |
| `dsh-sticker` | Installable DeepSeek Harness bundle: `send_sticker` tool + inline view. Bundles no media; loads sticker images/WebM from `sticker.stv.pm`. |
| `dsh-sticker-mcp-bundle` | Optional DSH configuration-only bundle connecting to the HTTP MCP endpoint. |

Build generated artifacts from the repository root:

```bash
npm run stickers:build
```

See [docs/sticker-agent-stack.md](../docs/sticker-agent-stack.md) for the full architecture and
usage.
