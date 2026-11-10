# @lynn/sticker-api

Zero-dependency REST API + MCP-over-HTTP endpoint.

```bash
npm run stickers:api
# lynn-sticker api listening on http://127.0.0.1:4319
```

Endpoints: `GET /health`, `/api/catalog`, `/api/stickers`, `/api/stickers/:id`, `/api/tags`,
`/api/random`, `/stickers/*` originals (with byte ranges), and `POST /mcp`.
`HOST` and `PORT` are environment overrides.

`POST /mcp` speaks MCP Streamable HTTP with JSON responses and returns `Mcp-Session-Id` on
initialize.
