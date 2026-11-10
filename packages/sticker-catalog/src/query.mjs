/**
 * Catalog query helpers shared by the REST API, the MCP server and scripts.
 * Pure functions over a loaded catalog object; the only I/O is the loader.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchSticker, scoreSticker } from './match.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CATALOG_PATH = join(here, '..', 'catalog.json')

/** Load the canonical catalog from disk. */
export function loadCatalog(path = DEFAULT_CATALOG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(number)))
}

const tagKey = value => String(value ?? '').toLowerCase()

/** Map a sticker to a stable API item with absolute media URLs. */
export function toApiItem(sticker, origin = '') {
  return {
    id: sticker.id,
    title: sticker.title,
    type: sticker.type,
    tags: sticker.tags,
    moods: sticker.moods,
    whenToUse: sticker.whenToUse,
    source: sticker.source,
    image: sticker.image,
    video: sticker.video,
    imageUrl: origin === '' ? sticker.image : `${origin}${sticker.image}`,
    videoUrl: sticker.video === null ? null : origin === '' ? sticker.video : `${origin}${sticker.video}`,
    ...(sticker.type === 'animated'
      ? { pack: sticker.pack, position: sticker.position, bytes: sticker.bytes, sha256: sticker.sha256 }
      : {}),
  }
}

/**
 * Search/filter/paginate the catalog.
 * A non-empty `q` ranks by match score; otherwise catalog order is preserved.
 */
export function searchStickers(catalog, options = {}) {
  const limit = clamp(options.limit, 1, 100, 20)
  const offset = clamp(options.offset, 0, Number.MAX_SAFE_INTEGER, 0)
  const type = options.type === 'static' || options.type === 'animated' ? options.type : undefined
  const tag = options.tag === undefined || options.tag === null ? '' : tagKey(options.tag)
  const query = options.q === undefined || options.q === null ? '' : String(options.q).trim()

  let pool = (catalog?.stickers ?? []).filter(sticker => type === undefined || sticker.type === type)
  if (tag !== '') {
    pool = pool.filter(sticker => (sticker.tags ?? []).some(value => tagKey(value) === tag))
  }

  let rows
  if (query !== '') {
    rows = pool
      .map(sticker => ({ sticker, score: scoreSticker(sticker, query) }))
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score || a.sticker.order - b.sticker.order)
  } else {
    rows = [...pool].sort((a, b) => a.order - b.order).map(sticker => ({ sticker, score: 0 }))
  }

  const total = rows.length
  const items = rows.slice(offset, offset + limit).map(row => toApiItem(row.sticker))
  return { total, count: items.length, offset, items }
}

/** Look up one sticker by exact id. */
export function getSticker(catalog, id) {
  const key = String(id ?? '')
  return (catalog?.stickers ?? []).find(sticker => sticker.id === key) ?? null
}

/** All tags with counts, sorted by count then tag. */
export function listTags(catalog) {
  const counts = new Map()
  for (const sticker of catalog?.stickers ?? []) {
    for (const tag of sticker.tags ?? []) {
      const key = String(tag)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/**
 * Pick one sticker. With `mood`, return the best match; otherwise pick a
 * uniform random sticker from the filtered pool.
 */
export function randomSticker(catalog, options = {}) {
  const type = options.type === 'static' || options.type === 'animated' ? options.type : undefined
  const mood = options.mood === undefined || options.mood === null ? '' : String(options.mood).trim()
  if (mood !== '') {
    const result = matchSticker(catalog, mood, { type })
    return result.match
  }
  const pool = (catalog?.stickers ?? []).filter(sticker => type === undefined || sticker.type === type)
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Aggregate counts for health/summary responses. */
export function catalogSummary(catalog) {
  return {
    version: catalog?.version ?? null,
    generatedAt: catalog?.generatedAt ?? null,
    static: catalog?.counts?.static ?? 0,
    animated: catalog?.counts?.animated ?? 0,
    total: catalog?.counts?.total ?? 0,
  }
}
