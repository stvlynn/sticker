/**
 * Deterministic bilingual sticker matcher.
 *
 * The matcher scores short mood/scene phrases against a sticker's id, title,
 * aliases, moods and tags. It is intentionally dependency-free and pure so it
 * can run in the REST API, the MCP server and a packaged DSH bundle.
 */

const SEPARATORS = /[\s,，。.!！?？、/|:：;；()（）[\]【】"'“”‘’]+/u

/** Normalize text for matching while preserving CJK characters. */
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split a query into candidate terms, keeping CJK phrases intact. */
export function queryTerms(query) {
  const normalized = normalizeText(query)
  if (normalized === '') return []
  const pieces = normalized.split(' ').filter(Boolean)
  const terms = new Set([normalized, ...pieces])
  // A whole Chinese sentence is useful as substring; also test 2-4 char slices
  // around likely mood words only when the sentence has no spaces.
  if (pieces.length === 1 && /[\u3400-\u9fff]/u.test(normalized)) {
    for (const piece of pieces) {
      if (piece.length > 4) {
        for (let start = 0; start < piece.length - 1; start++) {
          for (let size = 2; size <= Math.min(4, piece.length - start); size++) {
            terms.add(piece.slice(start, start + size))
          }
        }
      }
    }
  }
  return [...terms].filter(term => term.length >= 1)
}

const ANIMATED_SCORE_BONUS = 1.08

const FIELD_WEIGHTS = [
  { field: 'id', weight: 1000 },
  { field: 'title', weight: 600 },
  { field: 'aliases', weight: 450 },
  { field: 'moods', weight: 300 },
  { field: 'tags', weight: 200 },
]

function fieldTexts(sticker, field) {
  if (field === 'id' || field === 'title') return [normalizeText(sticker[field])]
  const values = Array.isArray(sticker[field]) ? sticker[field] : []
  return values.map(normalizeText).filter(Boolean)
}

function termScore(term, text) {
  if (text === '') return 0
  if (text === term) return 1
  if (text.includes(term)) return 0.5
  if (term.includes(text)) return 0.3
  return 0
}

/** Score one sticker for one query. Higher is better; 0 means no signal. */
export function scoreSticker(sticker, query) {
  const terms = queryTerms(query)
  if (terms.length === 0) return 0
  let total = 0
  for (const term of terms) {
    let best = 0
    for (const { field, weight } of FIELD_WEIGHTS) {
      for (const text of fieldTexts(sticker, field)) {
        const match = termScore(term, text)
        if (match === 0) continue
        const score = weight * match + term.length * 2
        if (score > best) best = score
      }
    }
    total += best
  }
  // Prefer animated stickers when scores are close; a clearly better static
  // match still wins (the bonus is multiplicative, not absolute).
  return sticker.type === 'animated' ? total * ANIMATED_SCORE_BONUS : total
}

/** Compact diagnostic row for a sticker. */
export function compactSticker(sticker) {
  return {
    id: sticker.id,
    title: sticker.title,
    type: sticker.type,
    tags: sticker.tags,
  }
}

/**
 * Pick the best sticker for a mood/scene phrase.
 * @param {object} catalog canonical catalog
 * @param {string} query mood/scene phrase
 * @param {{type?: 'static'|'animated', limit?: number}} [options]
 * @returns {{match: object|null, candidates: object[], score: number}}
 */
export function matchSticker(catalog, query, options = {}) {
  const type = options.type
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(20, options.limit)) : 5
  const pool = (catalog?.stickers ?? []).filter(sticker => type === undefined || sticker.type === type)
  const ranked = pool
    .map(sticker => ({ sticker, score: scoreSticker(sticker, query) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.sticker.order - b.sticker.order)
  const candidates = ranked.slice(0, limit).map(row => compactSticker(row.sticker))
  return {
    match: ranked.length === 0 ? null : ranked[0].sticker,
    candidates,
    score: ranked.length === 0 ? 0 : ranked[0].score,
  }
}

/** Explain a match for debugging and tests. */
export function explainMatch(catalog, query, options = {}) {
  const result = matchSticker(catalog, query, options)
  return {
    query,
    match: result.match === null ? null : compactSticker(result.match),
    score: result.score,
    candidates: result.candidates,
  }
}
