/**
 * Transport-independent MCP (Model Context Protocol) server logic for the
 * Lynn sticker library.
 *
 * The same handler backs the stdio server (`server.mjs`) and the HTTP `/mcp`
 * endpoint in `packages/sticker-api/server.mjs`. It implements a deliberately
 * small, stable slice of MCP: initialize, ping, tools/list and tools/call plus
 * empty resources/prompts catalogs. stdout is never written here.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { explainMatch, matchSticker } from '../sticker-catalog/src/match.mjs'
import { getSticker, listTags, searchStickers } from '../sticker-catalog/src/query.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const CATALOG_PATH = join(repo, 'packages/sticker-catalog/catalog.json')
const THUMBS_PATH = join(repo, 'packages/sticker-catalog/assets/thumbs.json')
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const LATEST_PROTOCOL_VERSION = '2025-06-18'
const SERVER_NAME = 'lynn-sticker'
const SERVER_VERSION = '1.0.0'
const MAX_TOOL_LIMIT = 50

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
const thumbs = existsSync(THUMBS_PATH) ? JSON.parse(readFileSync(THUMBS_PATH, 'utf8')).thumbs : {}

const INSTRUCTIONS = [
  'Lynn-chan sticker library: 261 static and animated stickers.',
  'Use search_stickers to find a sticker by mood/scene, then get_sticker to fetch one image.',
  'Images are returned only by get_sticker/random_sticker; use them sparingly and never as a substitute for an answer.',
].join(' ')

const TOOLS = [
  {
    name: 'search_stickers',
    description:
      'Search Lynn-chan stickers by mood or scene. Returns compact text rows (id | title | type | tags); call get_sticker with an id to fetch the image. Search returns no images.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Short Chinese or English mood/scene phrase, e.g. 摸鱼, 加班, tired, celebrate.' },
        type: { type: 'string', enum: ['static', 'animated'], description: 'Optional sticker type filter.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_TOOL_LIMIT, description: 'Maximum rows, default 8.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_sticker',
    description: 'Fetch one Lynn-chan sticker by id. Returns a text description and one small WebP image.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Exact sticker id from search_stickers (for example s-65 or a-001).' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'random_sticker',
    description: 'Get one sticker for a mood/scene, or a random sticker when mood is omitted. Returns a text description and one small WebP image.',
    inputSchema: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: 'Optional short Chinese or English mood/scene phrase.' },
        type: { type: 'string', enum: ['static', 'animated'], description: 'Optional sticker type filter.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_sticker_tags',
    description: 'List the sticker mood tags with counts so a caller can choose search words.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

const text = text => ({ type: 'text', text })

function compactRow(sticker) {
  return `${sticker.id} | ${sticker.title} | ${sticker.type} | ${(sticker.tags ?? []).join(',')}`
}

function stickerText(sticker) {
  const lines = [
    `id: ${sticker.id}`,
    `title: ${sticker.title}`,
    `type: ${sticker.type}`,
    `tags: ${(sticker.tags ?? []).join(', ')}`,
    `whenToUse: ${sticker.whenToUse}`,
    `image: ${sticker.image}`,
  ]
  if (sticker.video !== null) lines.push(`video: ${sticker.video}`)
  return lines.join('\n')
}

function imageContent(sticker) {
  const thumb = thumbs[sticker.id]
  if (thumb === undefined) return null
  const file = join(repo, 'packages/sticker-catalog/assets', thumb)
  if (!existsSync(file)) return null
  return { type: 'image', data: readFileSync(file).toString('base64'), mimeType: 'image/webp' }
}

function toolResult(sticker, { withImage = false } = {}) {
  const content = [text(stickerText(sticker))]
  if (withImage) {
    const image = imageContent(sticker)
    if (image !== null) content.push(image)
  }
  return {
    content,
    structuredContent: {
      id: sticker.id,
      title: sticker.title,
      type: sticker.type,
      tags: sticker.tags,
      image: sticker.image,
      video: sticker.video,
    },
  }
}

function asLimit(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 8
  return Math.max(1, Math.min(MAX_TOOL_LIMIT, Math.trunc(number)))
}

function callTool(name, args = {}) {
  if (name === 'search_stickers') {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (query === '') return { isError: true, content: [text('query must be a non-empty string')] }
    const type = args.type === 'static' || args.type === 'animated' ? args.type : undefined
    const limit = asLimit(args.limit)
    const result = searchStickers(catalog, { q: query, type, limit })
    if (result.items.length === 0) {
      const fallback = explainMatch(catalog, query, { type })
      return {
        isError: true,
        content: [text(`No sticker matched "${query}".${fallback.candidates.length > 0 ? ` Closest: ${fallback.candidates.map(row => `${row.id} ${row.title}`).join('; ')}` : ''}`)],
      }
    }
    const header = `Found ${result.total} match(es) for "${query}":`
    return { content: [text([header, ...result.items.map(compactRow)].join('\n'))] }
  }

  if (name === 'get_sticker') {
    const id = typeof args.id === 'string' ? args.id.trim() : ''
    if (id === '') return { isError: true, content: [text('id must be a non-empty string')] }
    const sticker = getSticker(catalog, id)
    if (sticker === null) return { isError: true, content: [text(`Unknown sticker id "${id}". Use search_stickers first.`)] }
    return toolResult(sticker, { withImage: true })
  }

  if (name === 'random_sticker') {
    const mood = typeof args.mood === 'string' ? args.mood.trim() : ''
    const type = args.type === 'static' || args.type === 'animated' ? args.type : undefined
    if (mood !== '') {
      const result = matchSticker(catalog, mood, { type })
      if (result.match === null) {
        return {
          isError: true,
          content: [text(`No sticker matched "${mood}".${result.candidates.length > 0 ? ` Closest: ${result.candidates.map(row => `${row.id} ${row.title}`).join('; ')}` : ''}`)],
        }
      }
      return toolResult(result.match, { withImage: true })
    }
    const pool = catalog.stickers.filter(sticker => type === undefined || sticker.type === type)
    const sticker = pool[Math.floor(Math.random() * pool.length)]
    return sticker === undefined ? { isError: true, content: [text('No stickers available.')] } : toolResult(sticker, { withImage: true })
  }

  if (name === 'list_sticker_tags') {
    const tags = listTags(catalog)
    return { content: [text(tags.map(row => `${row.tag} (${row.count})`).join('\n'))] }
  }

  return { isError: true, content: [text(`Unknown tool "${name}".`)] }
}

function jsonRpcError(code, message) {
  return { jsonrpc: '2.0', id: null, error: { code, message } }
}

/**
 * Handle one decoded JSON-RPC message.
 * @param {unknown} message
 * @returns {object|null} response, or null for notifications/ignored messages
 */
export function handleMcpMessage(message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return jsonRpcError(-32600, 'Invalid Request')
  }
  const { id, method, params } = message
  const isNotification = id === undefined || id === null

  if (typeof method !== 'string' || method === '') {
    return isNotification ? null : { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } }
  }

  try {
    if (method === 'initialize') {
      const requested = params && typeof params === 'object' ? params.protocolVersion : undefined
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions: INSTRUCTIONS,
        },
      }
    }
    if (method === 'notifications/initialized' || method.startsWith('notifications/')) return null
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} }
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
    if (method === 'tools/call') {
      if (params === null || typeof params !== 'object' || typeof params.name !== 'string') {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params: tools/call requires a tool name' } }
      }
      const args = params.arguments !== null && typeof params.arguments === 'object' ? params.arguments : {}
      const result = callTool(params.name, args)
      return { jsonrpc: '2.0', id, result }
    }
    if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } }
    if (method === 'resources/templates/list') return { jsonrpc: '2.0', id, result: { resourceTemplates: [] } }
    if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } }
    if (method === 'logging/setLevel') return { jsonrpc: '2.0', id, result: {} }
    return isNotification ? null : { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
  } catch (error) {
    return isNotification ? null : { jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } }
  }
}

/** Decode an HTTP JSON body and handle it as one MCP message. */
export function handleMcpJsonBody(rawBody) {
  let message
  try {
    message = JSON.parse(rawBody)
  } catch {
    return { status: 400, body: jsonRpcError(-32700, 'Parse error') }
  }
  if (Array.isArray(message)) return { status: 400, body: jsonRpcError(-32600, 'Batch requests are not supported') }
  const response = handleMcpMessage(message)
  if (response === null) return { status: 202, body: null }
  return { status: 200, body: response }
}

export { TOOLS, catalog, thumbs, SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS }
