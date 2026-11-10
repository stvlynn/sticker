# dsh-lynn-sticker-mcp

Optional, configuration-only DeepSeek Harness bundle that connects the Harness to the local
Lynn-chan sticker MCP server.

## Prerequisites

Start the local server (serves both the REST API and `POST /mcp`):

```bash
npm run stickers:api
# lynn-sticker api listening on http://127.0.0.1:4319
```

## Install

From the repository root:

```bash
# Plugin Manager -> Add local bundle -> /absolute/path/to/packages/dsh-sticker-mcp-bundle
```

The bundle inserts `@deepseek-ai/dsh-mcp-client` with `serverName: lynn_sticker` and exposes tools
named `mcp__lynn_sticker__search_stickers`, `mcp__lynn_sticker__get_sticker`,
`mcp__lynn_sticker__random_sticker` and `mcp__lynn_sticker__list_sticker_tags`.

## Why this is optional

Every discovered MCP tool definition enters the model's tool list on every request. The direct
`dsh-lynn-sticker` bundle exposes one compact `send_sticker` tool and renders the sticker inline,
which is the context-efficient path for DeepSeek Harness. Use this MCP bundle only when you want a
shared MCP namespace (for example, several agents or a non-DSH client).

## Not installed by default

Nothing in this repository installs this bundle automatically. Installing both bundles is allowed
but adds the MCP tool schemas to every request.
