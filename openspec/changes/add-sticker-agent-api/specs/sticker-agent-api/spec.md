## ADDED Requirements

### Requirement: Canonical sticker catalog
The system SHALL publish one generated catalog covering every sticker in the repository, with a stable id, title, type, at least two mood tags, at least one mood phrase, and the original asset paths.

#### Scenario: Catalog completeness
- **WHEN** the catalog build runs
- **THEN** it produces 80 static entries and 181 animated entries with unique ids and existing source files, and fails otherwise

#### Scenario: Catalog is machine-readable
- **WHEN** an agent or tool reads `packages/sticker-catalog/catalog.json`
- **THEN** each sticker exposes id, title, type, tags, moods, whenToUse, image and video-or-null without absolute machine paths

### Requirement: Sticker REST API
The system SHALL serve the sticker catalog over HTTP with search, lookup, tag listing, random selection and original media access.

#### Scenario: Search by mood
- **WHEN** a client calls `GET /api/stickers?q=摸鱼`
- **THEN** the response contains matching stickers ordered by match score and excludes unrelated stickers from the first page

#### Scenario: Original media
- **WHEN** a client requests a sticker's `/stickers/...` path
- **THEN** the server returns the original bytes with the correct content type and rejects path traversal and unknown files

### Requirement: Sticker MCP server
The system SHALL expose the sticker library through an MCP server so any MCP-capable agent can discover and fetch stickers.

#### Scenario: Tool discovery
- **WHEN** an MCP client initializes and calls `tools/list`
- **THEN** the server advertises `search_stickers`, `get_sticker`, `random_sticker` and `list_sticker_tags`

#### Scenario: Image result
- **WHEN** an MCP client calls `get_sticker` with a valid id
- **THEN** the result contains text metadata and one WebP image content block, while `search_stickers` returns text only

### Requirement: DeepSeek Harness sticker tool
The system SHALL provide an installable DeepSeek Harness bundle whose agent-facing `send_sticker` tool renders a fitting sticker inline in the conversation without adding sticker images or the catalog to model context.

#### Scenario: Agent sends a sticker
- **WHEN** an agent calls `send_sticker` with a mood phrase
- **THEN** the tool resolves one sticker, returns a one-line model-facing result, and the browser renders that sticker inline from the tool-call view

#### Scenario: Context restraint
- **WHEN** the bundle is active in a DSH profile
- **THEN** only the compact tool schema, one short prompt hint and one-line results enter model context, and at most one sticker per turn is sent

#### Scenario: Packaging
- **WHEN** the plugin packaging script runs
- **THEN** it produces a tarball containing the manifests, host/client halves, catalog and every referenced generated asset
