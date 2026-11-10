/**
 * Host half of the Lynn sticker DeepSeek Harness bundle.
 *
 * Registers one model-facing tool (`send_sticker`) and one short prompt hint.
 * The package intentionally ships NO sticker media: `tool/result.meta` carries
 * absolute sticker.stv.pm URLs, and the browser half renders those URLs inline.
 * Only the compact matching metadata is bundled, and it is refreshed from the
 * deployed `catalog.json` after activation when the site is reachable.
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SITE_BASE = 'https://sticker.stv.pm'
const SITE_BASE = normalizeBase(process.env.LYNN_STICKER_BASE_URL)
const CATALOG_TTL_MS = resolveTtl(process.env.LYNN_STICKER_CATALOG_TTL_MS)
const MAX_PER_TURN = 1

export const name = 'lynn-sticker'
export const inject = ['tools', 'systemPrompt']

const GUIDANCE = [
  'Lynn stickers: call `send_sticker` when a human moment clearly fits — a greeting, thanks, celebration after finishing something, frustration after a failure, a funny accident, or a break.',
  'After substantive tool work, a task hook may note that a tool just finished; decide for yourself whether this is a natural stopping point for a sticker.',
  'When several stickers fit, prefer an animated sticker. At most one per turn; never let a sticker replace a substantive answer, and skip routine or serious tasks.',
].join(' ')

const TOOL_DESCRIPTION = [
  'Send one Lynn-chan chat sticker that fits the current mood or scene.',
  'Use it at clear human moments: greeting, thanks, celebration after completing something, frustration after a failure, a funny accident, or a break; after substantive tool work, decide whether the task is at a natural stopping point.',
  'Use sparingly: at most once per turn, only when it adds warmth or humor, and never as the only response; skip routine or serious tasks.',
  'Pass a short Chinese or English mood/scene phrase in `mood`; the best sticker is chosen automatically, preferring animated stickers when several fit.',
  'An optional `id` from a previous result selects an exact sticker.',
].join(' ')

/** Active sticker sends per session turn; a soft one-per-turn limit. */
const sentTurns = new Map()

const SEPARATORS = /[\s,，。.!！?？、/|:：;；()（）[\]【】"'“”‘’]+/gu

function normalizeBase(value) {
  const raw = String(value ?? '').trim()
  return (raw === '' ? DEFAULT_SITE_BASE : raw).replace(/\/+$/u, '')
}

/** Resolve one site-relative sticker path to an absolute https URL. */
function siteUrl(path) {
  try {
    return new URL(path, `${SITE_BASE}/`).href
  } catch {
    return path
  }
}

/** Validate and normalize either the bundled or the remotely fetched catalog. */
function normalizeCatalog(payload) {
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.stickers)) return null
  const rows = []
  for (const [index, sticker] of payload.stickers.entries()) {
    if (sticker === null || typeof sticker !== 'object') continue
    const { id, title, type, image } = sticker
    if (typeof id !== 'string' || id === '') continue
    if (typeof title !== 'string' || title === '') continue
    if (type !== 'static' && type !== 'animated') continue
    if (typeof image !== 'string' || !image.startsWith('/')) continue
    const video = typeof sticker.video === 'string' && sticker.video.startsWith('/') ? sticker.video : null
    const rawTags = Array.isArray(sticker.tags) ? sticker.tags : []
    const rawMoods = Array.isArray(sticker.moods) ? sticker.moods : []
    const tags = [...new Set(rawTags.filter(tag => typeof tag === 'string' && tag !== ''))]
    const moods = [...new Set([...rawMoods.filter(mood => typeof mood === 'string' && mood !== ''), ...tags])]
    rows.push({
      id,
      order: Number.isFinite(sticker.order) ? sticker.order : index,
      title,
      type,
      tags: tags.length > 0 ? tags : [title],
      moods: moods.length > 0 ? moods : [title],
      whenToUse: typeof sticker.whenToUse === 'string' ? sticker.whenToUse : '',
      image,
      video,
    })
  }
  return rows.length > 0 ? { stickers: rows } : null
}

const bundledCatalog = normalizeCatalog(JSON.parse(readFileSync(join(here, 'catalog.json'), 'utf8')))
if (bundledCatalog === null) throw new Error('lynn-sticker: bundled catalog.json is invalid')

let activeCatalog = bundledCatalog
let byId = new Map(activeCatalog.stickers.map(sticker => [sticker.id, sticker]))

function replaceCatalog(next) {
  if (next === null) return
  activeCatalog = next
  byId = new Map(activeCatalog.stickers.map(sticker => [sticker.id, sticker]))
}

/**
 * Refresh the matching metadata from the deployed site in the background. The
 * bundled catalog is the offline fallback; failure is silent.
 */
/** Resolve a positive TTL with a sane floor and ceiling. */
function resolveTtl(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 5 * 60 * 1000
  return Math.max(1000, Math.min(parsed, 24 * 60 * 60 * 1000))
}

let disposed = false
let refreshInFlight = false
let refreshController = null
let lastRefreshAt = 0

/**
 * Refresh the metadata catalog at most once per TTL. The request runs in the
 * background; a failure is silent and retried after the next TTL window.
 */
function refreshCatalog() {
  if (disposed || refreshInFlight || typeof fetch !== 'function') return
  refreshInFlight = true
  const controller = new AbortController()
  refreshController = controller
  const timer = setTimeout(() => controller.abort(), 3500)
  fetch(`${SITE_BASE}/catalog.json`, {
    signal: controller.signal,
    headers: { accept: 'application/json' },
  })
    .then(response => (response.ok ? response.json() : null))
    .then(payload => {
      if (!disposed) replaceCatalog(normalizeCatalog(payload))
    })
    .catch(() => {})
    .finally(() => {
      clearTimeout(timer)
      lastRefreshAt = Date.now()
      refreshInFlight = false
      if (refreshController === controller) refreshController = null
    })
}

/** Trigger a background refresh when the cached metadata is older than TTL. */
function maybeRefreshCatalog() {
  if (disposed || refreshInFlight) return
  if (lastRefreshAt !== 0 && Date.now() - lastRefreshAt < CATALOG_TTL_MS) return
  refreshCatalog()
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(SEPARATORS, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function queryTerms(query) {
  const normalized = normalizeText(query)
  if (normalized === '') return []
  const pieces = normalized.split(' ').filter(Boolean)
  const terms = new Set([normalized, ...pieces])
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
  ['id', 1000],
  ['title', 600],
  ['aliases', 450],
  ['moods', 300],
  ['tags', 200],
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

function scoreSticker(sticker, query) {
  const terms = queryTerms(query)
  if (terms.length === 0) return 0
  let total = 0
  for (const term of terms) {
    let best = 0
    for (const [field, weight] of FIELD_WEIGHTS) {
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

function matchSticker(query) {
  const ranked = activeCatalog.stickers
    .map(sticker => ({ sticker, score: scoreSticker(sticker, query) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.sticker.order - b.sticker.order)
  return {
    match: ranked.length === 0 ? null : ranked[0].sticker,
    candidates: ranked.slice(0, 4).map(row => `${row.sticker.id} — ${row.sticker.title}`),
  }
}

function compactResult(sticker) {
  return { sent: true, id: sticker.id, title: sticker.title, type: sticker.type, reason: '' }
}

function skipped(reason) {
  return { sent: false, id: '', title: '', type: 'static', reason }
}

/** Tools whose result means substantive task work happened. */
const MUTATION_TOOLS = new Set(['edit', 'write', 'apply_patch', 'bash', 'terminal_open', 'terminal_send', 'terminal_close', 'pwsh'])
const taskTurns = new Map()

const TASK_NUDGE = [
  'Task lifecycle check at the end of the ReAct loop: substantive tool work happened in this turn.',
  'If a sticker fits the user\'s mood and this is a natural stopping point, call send_sticker once now.',
  'If not, do not call send_sticker and do not add commentary; end the turn.',
].join(' ')

function turnStateFor(agent, turn) {
  const key = `${String(agent.session.id)}:${turn}`
  let state = taskTurns.get(key)
  if (state === undefined) {
    state = { worked: false, stickered: false, nudged: false }
    taskTurns.set(key, state)
    if (taskTurns.size > 2000) {
      for (const oldKey of [...taskTurns.keys()].slice(0, 500)) taskTurns.delete(oldKey)
    }
  }
  return state
}

function installTaskHook(ctx) {
  ctx.effect(
    () =>
      ctx.on('tools/result', (exec, result) => {
        if (exec.agent === undefined) return
        const agents = ctx.get('agents')
        if (agents === undefined) return
        const turn = agents.turnBoundaryOf(exec.agent.session).lastTurn
        const state = turnStateFor(exec.agent, turn)
        if (exec.name === 'send_sticker') state.stickered = true
        if (MUTATION_TOOLS.has(exec.name)) state.worked = true
      }),
    'lynn-sticker: task result tracking',
  )
  ctx.effect(
    () =>
      ctx.on('agent/turn-stopping', ({ agent, turn }) => {
        const state = turnStateFor(agent, turn)
        if (!state.worked || state.stickered || state.nudged) return
        state.nudged = true
        agent.steer({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: TASK_NUDGE }],
          source: { kind: 'lynn-sticker-hook', form: 'notice', summary: 'Sticker moment check' },
        })
      }),
    'lynn-sticker: ReAct end hook',
  )
}

/**
 * Register the sticker tool, prompt hint, task lifecycle hook and catalog refresh.
 * @param {object} ctx Cordis context
 */
export function apply(ctx) {
  const tool = {
    name: 'send_sticker',
    description: TOOL_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          description: 'Short Chinese or English mood/scene phrase, e.g. 摸鱼, 加班, 谢谢, tired, celebrate.',
        },
        id: {
          type: 'string',
          description: 'Optional exact sticker id from a previous result.',
        },
      },
      required: ['mood'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          sent: { type: 'boolean' },
          id: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string', enum: ['static', 'animated'] },
          reason: { type: 'string' },
        },
        required: ['sent', 'id', 'title', 'type', 'reason'],
        additionalProperties: false,
      },
      render(_args, value) {
        return [
          {
            type: 'text',
            text: value.sent ? `Sent sticker "${value.title}".` : `Sticker skipped: ${value.reason}.`,
          },
        ]
      },
      presentationMeta(_args, value) {
        if (value.sent !== true) return { sent: false }
        const sticker = byId.get(value.id)
        if (sticker === undefined) return { sent: false }
        return {
          sent: true,
          id: sticker.id,
          title: sticker.title,
          type: sticker.type,
          thumb: siteUrl(sticker.image),
          video: sticker.video === null ? null : siteUrl(sticker.video),
        }
      },
    },
    async execute(args, exec) {
      maybeRefreshCatalog()
      const raw = args !== null && typeof args === 'object' ? args : {}
      let sticker = null
      if (typeof raw.id === 'string' && raw.id.trim() !== '') {
        sticker = byId.get(raw.id.trim()) ?? null
        if (sticker === null) {
          throw new Error(`Unknown sticker id "${raw.id}". Omit id and pass a mood phrase instead.`)
        }
      } else {
        const mood = typeof raw.mood === 'string' ? raw.mood.trim() : ''
        if (mood === '') throw new Error('send_sticker requires a non-empty mood phrase.')
        const result = matchSticker(mood)
        if (result.match === null) {
          throw new Error(
            `No sticker matched "${mood}".${result.candidates.length > 0 ? ` Try one of: ${result.candidates.join('; ')}` : ''}`,
          )
        }
        sticker = result.match
      }

      const agents = exec.agent === undefined ? undefined : ctx.get('agents')
      if (agents !== undefined && exec.agent !== undefined) {
        const session = exec.agent.session
        const turn = agents.turnBoundaryOf(session).lastTurn
        const key = `${String(session.id)}:${turn}`
        const count = sentTurns.get(key) ?? 0
        if (count >= MAX_PER_TURN) {
          return skipped('already sent a sticker this turn')
        }
        sentTurns.set(key, count + 1)
        if (sentTurns.size > 2000) {
          for (const oldKey of [...sentTurns.keys()].slice(0, 500)) sentTurns.delete(oldKey)
        }
      }

      return compactResult(sticker)
    },
    presentCall(args) {
      const mood = args !== null && typeof args === 'object' && typeof args.mood === 'string' ? args.mood : ''
      return { card: 'generic', title: 'Send sticker', kind: 'other', rawInput: { mood } }
    },
  }

  ctx.effect(() => ctx.tools.register(tool), 'lynn-sticker: send_sticker tool')

  const disposePrompt = ctx.systemPrompt.section({
    name: 'tool:lynn-sticker',
    order: ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH'),
    text: ({ scope }) => (ctx.tools.get('send_sticker', scope) === undefined ? '' : GUIDANCE),
  })
  ctx.effect(() => disposePrompt, 'lynn-sticker: prompt hint')

  installTaskHook(ctx)

  disposed = false
  ctx.effect(() => () => {
    disposed = true
    refreshController?.abort()
  }, 'lynn-sticker: catalog refresh cleanup')
  maybeRefreshCatalog()
}
