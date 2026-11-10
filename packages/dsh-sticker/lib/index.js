/**
 * Host half of the Lynn sticker DeepSeek Harness bundle.
 *
 * Registers one model-facing tool (`send_sticker`), one short prompt hint, and
 * an optional media route for animated WebM loops. The tool result carries a
 * tiny model-facing line; the sticker itself travels through `tool/result.meta`
 * and is rendered by the browser half, so no image or catalog enters model
 * context.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const catalog = JSON.parse(readFileSync(join(here, 'catalog.json'), 'utf8'))
const stickers = catalog.stickers.map((sticker, index) => ({ ...sticker, order: sticker.order ?? index }))
const byId = new Map(stickers.map(sticker => [sticker.id, sticker]))
const assetsDir = join(here, 'assets')
const animDir = join(assetsDir, 'anim')
const PACKAGE_NAME = 'dsh-lynn-sticker'
const MEDIA_PREFIX = '/lynn-sticker-media'
const MAX_PER_TURN = 1

export const name = 'lynn-sticker'
export const inject = ['tools', 'systemPrompt']

const GUIDANCE = [
  'Lynn stickers: when the user\'s moment is emotional or playful (thanks, greeting, celebration, frustration, a funny failure, a break), you may call `send_sticker` once with a short mood phrase.',
  'Never let a sticker replace a substantive answer, and skip it for routine or serious tasks.',
].join(' ')

const TOOL_DESCRIPTION = [
  'Send one Lynn-chan chat sticker that fits the current mood or scene.',
  'Use sparingly: at most once per turn, only when it adds warmth or humor, and never as the only response.',
  'Pass a short Chinese or English mood/scene phrase in `mood`; the best sticker is chosen automatically.',
  'An optional `id` from a previous result selects an exact sticker.',
].join(' ')

/** Active sticker sends per session turn; a soft one-per-turn limit. */
const sentTurns = new Map()

const SEPARATORS = /[\s,，。.!！?？、/|:：;；()（）[\]【】"'“”‘’]+/gu

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
  return total
}

function matchSticker(query) {
  const ranked = stickers
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

function mediaUrl(sticker) {
  if (sticker.video === null) return null
  return `${MEDIA_PREFIX}/${sticker.video.replace(/^anim\//u, '')}`
}

function mediaHeaders(contentLength) {
  return {
    'content-type': 'video/webm',
    'content-length': String(contentLength),
    'cache-control': 'public, max-age=31536000, immutable',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
  }
}

/** Serve one generated animated loop with byte-range support. */
function createMediaHandler() {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'access-control-allow-origin': '*' })
      res.end()
      return
    }
    let pathname
    try {
      pathname = new URL(String(req.url ?? '/'), 'http://localhost').pathname
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    const name = pathname.slice(MEDIA_PREFIX.length).replace(/^\//u, '')
    if (!/^[a-z0-9-]+\.webm$/u.test(name)) {
      res.writeHead(404, { 'access-control-allow-origin': '*' })
      res.end()
      return
    }
    const file = resolve(animDir, name)
    if (!file.startsWith(`${animDir}${sep}`) || !existsSync(file)) {
      res.writeHead(404, { 'access-control-allow-origin': '*' })
      res.end()
      return
    }
    const stats = statSync(file)
    if (!stats.isFile()) {
      res.writeHead(404, { 'access-control-allow-origin': '*' })
      res.end()
      return
    }
    const rangeHeader = req.headers.range
    const range = typeof rangeHeader === 'string' ? /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim()) : null
    if (range !== null) {
      const startText = range[1]
      const endText = range[2]
      let start
      let end
      if (startText === '') {
        const suffix = Number(endText)
        if (!Number.isFinite(suffix) || suffix <= 0) {
          res.writeHead(416, { 'content-range': `bytes */${stats.size}` })
          res.end()
          return
        }
        start = Math.max(0, stats.size - suffix)
        end = stats.size - 1
      } else {
        start = Number(startText)
        end = endText === '' ? stats.size - 1 : Number(endText)
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= stats.size || end < start) {
        res.writeHead(416, { 'content-range': `bytes */${stats.size}` })
        res.end()
        return
      }
      end = Math.min(end, stats.size - 1)
      res.writeHead(206, {
        ...mediaHeaders(end - start + 1),
        'content-range': `bytes ${start}-${end}/${stats.size}`,
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      createReadStream(file, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, mediaHeaders(stats.size))
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file).pipe(res)
  }
}

/**
 * Register the sticker tool, prompt hint, and media route.
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
          thumb: `plugins/${PACKAGE_NAME}/assets/${sticker.thumb}`,
          video: mediaUrl(sticker),
        }
      },
    },
    async execute(args, exec) {
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

  ctx.inject(['webServer'], webCtx => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'prefix',
          path: MEDIA_PREFIX,
          handler: createMediaHandler(),
        }),
      'lynn-sticker: animated media route',
    )
  })
}
