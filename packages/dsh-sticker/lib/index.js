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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SITE_BASE = 'https://sticker.stv.pm'
const SITE_BASE = normalizeBase(process.env.LYNN_STICKER_BASE_URL)
const CATALOG_TTL_MS = resolveTtl(process.env.LYNN_STICKER_CATALOG_TTL_MS)
const MAX_PER_TURN = 1

export const name = 'lynn-sticker'
export const inject = ['tools', 'systemPrompt', 'sessionProjections']

const GUIDANCE = [
  'Lynn stickers: when the user\'s moment is emotional or playful (thanks, greeting, celebration, frustration, a funny failure, a break), you may call `send_sticker` once with a short mood phrase.',
  'When several stickers fit, prefer an animated sticker.',
  'Never let a sticker replace a substantive answer, and skip it for routine or serious tasks.',
].join(' ')

const TOOL_DESCRIPTION = [
  'Send one Lynn-chan chat sticker that fits the current mood or scene.',
  'Use sparingly: at most once per turn, only when it adds warmth or humor, and never as the only response.',
  'Pass a short Chinese or English mood/scene phrase in `mood`; the best sticker is chosen automatically.',
  'When several stickers fit, prefer an animated sticker.',
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
let byTitle = new Map(activeCatalog.stickers.map(sticker => [sticker.title, sticker]))

function replaceCatalog(next) {
  if (next === null) return
  activeCatalog = next
  byId = new Map(activeCatalog.stickers.map(sticker => [sticker.id, sticker]))
  byTitle = new Map(activeCatalog.stickers.map(sticker => [sticker.title, sticker]))
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

/** Phrases that suppress automatic stickers: refusal or meta/development talk. */
const AUTO_NEGATIVE = /(不要|别|不用|无需).{0,8}(贴纸|表情包|表情|sticker)|no sticker/i
const AUTO_TECHNICAL = /(插件|触发|概率|hook|实现机制|提示词|工具调用|列表|硬编码|动态检索)/i

/** User-side intent rules, first match wins. Titles resolve against the active catalog. */
const AUTO_INTENTS = [
  { title: '贴贴', terms: ['谢谢', '感谢', '多谢', 'thanks', 'thank you', 'thx'] },
  { title: 'Greeting 1', terms: ['你好', '您好', '嗨', '哈喽', '早上好', '早安', '晚上好', 'hello', 'hi', 'hey'] },
  { title: 'Sleep (Normal)', terms: ['晚安', '睡了', '睡觉', '困了', '困死', 'good night'] },
  { title: 'Eat (Popcorn)', terms: ['干饭', '吃饭', '饿了', '好饿', '外卖', 'food', 'hungry'] },
  { title: 'coffee_desperate', terms: ['咖啡', 'coffee', '续命'] },
  { title: 'Work Nap', terms: ['好累', '累死', '累了', '加班', '熬夜', 'deadline', 'ddl', 'tired'] },
  { title: 'Angry', terms: ['生气', '愤怒', '气死', '火大', '烦死', 'angry', 'mad'] },
  { title: 'Bug', terms: ['bug', '报错', '错误', 'error'] },
  { title: 'This Is Fine 1', terms: ['失败', '崩了', '炸了', '挂了', 'failed', 'failure', 'broken'] },
  { title: 'Question', terms: ['困惑', '不懂', '为什么', '问号', '啥意思', 'confused'] },
  { title: 'Celebration', terms: ['完成', '搞定', '成功', '上线', '通过', '庆祝', '太好了', '牛逼', 'yay', 'celebrate', 'done', 'success', 'deployed'] },
  { title: 'Cheer', terms: ['加油', '冲鸭', 'cheer'] },
  { title: 'Surprise', terms: ['震惊', '卧槽', '吃惊', 'surprise', 'wow'] },
  { title: 'Cry 1', terms: ['哭', '难过', '伤心', 'cry', 'sad'] },
  { title: 'Laugh', terms: ['哈哈', '笑死', '想笑', 'laugh', 'lol'] },
  { title: 'Money', terms: ['工资', '发财', '赚钱', 'money', '亏了'] },
  { title: 'Luv 1', terms: ['喜欢', '爱你', '贴贴', 'love', 'luv'] },
  { title: 'Work Nap', terms: ['摸鱼', '偷懒', '划水'] },
  { title: 'bubble_tea', terms: ['奶茶', 'bubble tea'] },
  { title: '贴贴', terms: ['表情包', '贴纸', 'sticker'] },
]

const SUCCESS_TERMS = ['完成', '搞定', '成功', '上线', '通过', '修好', '部署', 'done', 'success', 'deployed', 'fixed', 'passed']
const FAILURE_TERMS = ['失败', '报错', '错误', '崩了', '炸了', 'failed', 'failure', 'error']
const MUTATION_TOOLS = new Set(['edit', 'write', 'apply_patch', 'bash', 'terminal_open', 'terminal_send', 'terminal_close', 'pwsh'])
const IDENTITY_SCHEMA = { parse: value => value }

function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .map(block => (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join(' ')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function hasTerm(text, terms) {
  const lower = String(text ?? '').toLowerCase()
  for (const term of terms) {
    const needle = term.toLowerCase()
    if (/^[a-z0-9 ]+$/u.test(needle)) {
      if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, 'u').test(lower)) return true
    } else if (lower.includes(needle)) {
      return true
    }
  }
  return false
}

function autoStickerMeta(title) {
  const sticker = byTitle.get(title)
  if (sticker === undefined) return null
  return {
    sent: true,
    id: sticker.id,
    title: sticker.title,
    type: sticker.type,
    thumb: siteUrl(sticker.image),
    video: sticker.video === null ? null : siteUrl(sticker.video),
  }
}

function newTurnState(turn) {
  return { turn, userText: '', assistantText: '', toolCalls: 0, mutationCalls: 0, toolErrors: 0, calls: {}, manual: false }
}

function decideAutoSticker(current) {
  if (current.manual) return null
  const userText = current.userText.trim()
  if (userText === '' || userText.length > 260) return null
  if (AUTO_NEGATIVE.test(userText) || AUTO_TECHNICAL.test(userText)) return null
  for (const intent of AUTO_INTENTS) {
    if (hasTerm(userText, intent.terms)) return autoStickerMeta(intent.title)
  }
  const success = hasTerm(current.assistantText, SUCCESS_TERMS)
  const failure = hasTerm(current.assistantText, FAILURE_TERMS)
  if (current.mutationCalls > 0 && current.toolErrors === 0 && success) return autoStickerMeta('Celebration')
  if (current.mutationCalls > 0 && current.toolErrors > 0 && failure) return autoStickerMeta('This Is Fine 1')
  return null
}

/**
 * Durable, replayable auto-sticker decision. This is the task-related hook:
 * it folds turn/start, user/message, assistant/message, tool/call and
 * tool/result events and records one sticker per completed turn. The client
 * turnTail reads the wire view by turn number.
 */
const AUTO_STICKER_PROJECTION = {
  key: 'lynnStickerAuto',
  stateSchema: IDENTITY_SCHEMA,
  viewSchema: IDENTITY_SCHEMA,
  init: () => ({ byTurn: {}, current: null }),
  apply(state, event) {
    const type = event.type
    const data = event.data ?? {}
    if (type === 'turn/start') {
      return { ...state, current: newTurnState(data.turn) }
    }
    if (type === 'turn/end' && state.current === null) return state
    let current = state.current
    if (current === null) {
      if (typeof data.turn !== 'number') return state
      current = newTurnState(data.turn)
    }
    if (type === 'user/message') {
      if (data.source?.kind !== 'user') return state
      const text = textOfContent(data.content)
      return text === '' ? state : { ...state, current: { ...current, userText: `${current.userText} ${text}`.trim() } }
    }
    if (type === 'assistant/message') {
      const text = textOfContent(data.message?.content)
      return text === '' ? state : { ...state, current: { ...current, assistantText: `${current.assistantText} ${text}`.trim() } }
    }
    if (type === 'tool/call') {
      const name = typeof data.name === 'string' ? data.name : ''
      return {
        ...state,
        current: {
          ...current,
          toolCalls: current.toolCalls + 1,
          mutationCalls: current.mutationCalls + (MUTATION_TOOLS.has(name) ? 1 : 0),
          calls: { ...current.calls, [String(data.callId)]: name },
          manual: current.manual || name === 'send_sticker',
        },
      }
    }
    if (type === 'tool/result') {
      const callId = data.message?.toolCallId
      const name = callId === undefined ? undefined : current.calls[String(callId)]
      return {
        ...state,
        current: {
          ...current,
          toolErrors: current.toolErrors + (data.message?.isError === true ? 1 : 0),
          manual: current.manual || name === 'send_sticker',
        },
      }
    }
    if (type === 'turn/end') {
      if (current.turn !== data.turn) return state
      return { byTurn: { ...state.byTurn, [String(current.turn)]: decideAutoSticker(current) }, current: null }
    }
    return { ...state, current }
  },
  wire: {
    viewSchema: IDENTITY_SCHEMA,
    view: state => state.byTurn,
    summary: false,
  },
  stateVersion: 1,
}

/**
 * Register the sticker tool, prompt hint, auto-sticker projection and catalog refresh.
 * @param {object} ctx Cordis context
 */
export async function apply(ctx) {
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

  await ctx.sessionProjections.register(AUTO_STICKER_PROJECTION)

  disposed = false
  ctx.effect(() => () => {
    disposed = true
    refreshController?.abort()
  }, 'lynn-sticker: catalog refresh cleanup')
  maybeRefreshCatalog()
}
