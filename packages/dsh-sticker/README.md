# dsh-lynn-sticker

A DeepSeek Harness bundle that lets an agent send a Lynn-chan sticker inline in the conversation
when the moment fits — without putting the sticker catalog or any image into model context.

- One compact model tool: `send_sticker({ mood, id? })`; when several stickers fit, the matcher
  prefers an animated one (with a small score bonus) and the prompt asks the model to do the same.
- One short system-prompt hint, about 55 words.
- One-line tool results (`Sent sticker "摸鱼".`), no images or base64 in model context.
- The sticker is rendered at the **end of the completed turn** through
  `conversation.chat.turnTail`, so it is visible in normal conversation flow without expanding the
  collapsed tool-call group. The browser loads the media on demand from **https://sticker.stv.pm**;
  animated stickers play the site's WebM and fall back to the poster under reduced motion.
- The npm package bundles **no sticker media** — only the compact matching metadata
  (`lib/catalog.json`, ~120 KB) and the host/client code. The published tarball is ~70 KB.
- A soft limit of one sticker per assistant turn.
- Task lifecycle hook: at the end of the ReAct loop (`agent/turn-stopping`), if the turn had
  substantive tool work (`edit`, `write`, `apply_patch`, `bash`, terminal), the host steers one
  short note asking the model to decide whether this is a natural sticker moment. The model
  chooses; the host does not hardcode intent rules or pick a sticker. The expanded tool description
  and prompt hint spell out the moments where a sticker is appropriate (greeting, thanks,
  celebration, frustration, a funny failure, a break).

## Install

The package is published to npm as `dsh-lynn-sticker`:

```text
plugin_manager install_bundle target=dsh-lynn-sticker@1.2.0
```

Or install the local bundle directory (from this checkout):

```text
plugin_manager install_bundle target=/Users/steven/code/sticker/packages/dsh-sticker
```

The local directory install links the checkout, so the committed `lib/catalog.json` is used
directly. No generated media is required.

## Use

The agent calls:

```json
{ "mood": "今天终于上线了，开心" }
```

The tool resolves the best sticker server-side and returns one line to the model. The UI loads the
sticker image/WebM from `sticker.stv.pm` and shows it inline. Passing `id` (for example `s-65`)
selects an exact sticker from a previous result.

Use it sparingly: it is for warmth and humor, never a substitute for a substantive answer.

## What enters model context

| Item | Approximate cost |
|---|---|
| Tool schema + description | ~150 tokens |
| Prompt hint | ~70 tokens |
| One send result | ~15 tokens |
| Sticker image / video | 0 tokens (never sent to the model) |
| Catalog metadata | 0 tokens (not injected; used only for matching) |

A second `send_sticker` call in the same turn returns `Sticker skipped: already sent a sticker this
turn.` and renders nothing.

## Media loading and dynamic catalog

The host half builds absolute media URLs from a configurable base URL (default
`https://sticker.stv.pm`):

- Static sticker: `https://sticker.stv.pm/stickers/<name>.png`
- Animated sticker: poster `…/stickers/animated/<name>.png` plus WebM
  `…/stickers/animated/<name>.webm`

Set `LYNN_STICKER_BASE_URL` in the DSH environment to point at a different deployment.

The host also fetches `${LYNN_STICKER_BASE_URL}/catalog.json` in the background and swaps in the
refreshed metadata if it is valid. Refreshes are TTL-based: at activation and on a tool call when
the cached list is older than **5 minutes** (override with `LYNN_STICKER_CATALOG_TTL_MS`). The
bundled `lib/catalog.json` is the offline fallback, so stickers keep working if the site is
unreachable. Updating the deployed `public/catalog.json` therefore makes **new or retagged
stickers** available without republishing the npm package; updating sticker images on the site
needs no package change at all.

## Build and package (repository development)

```bash
npm run stickers:build   # canonical catalog + public/catalog.json + MCP stills + lib/catalog.json
npm run stickers:pack    # dist/dsh-lynn-sticker-1.2.0.tgz
```

The packaging script fails if any sticker media is bundled or if the catalog references a
non-site-relative path. The tarball contains the host/client halves, `lib/catalog.json`, the
patch, locales, icon and LICENSE — no images.

## License and attribution

Sticker artwork and the plugin icon are licensed under **CC BY 4.0** by Steven Lynn
(<https://x.com/Stv_Lynn>) and contributors; keep the attribution when redistributing. The plugin
icon is derived from `public/stickers/mhy.png`. See [LICENSE](LICENSE).

See also the repository root [README](../../README.md) and [LICENSE](../../LICENSE).
