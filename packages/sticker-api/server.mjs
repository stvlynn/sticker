#!/usr/bin/env node
/**
 * Lynn sticker REST API + MCP-over-HTTP endpoint.
 *
 *   GET /health
 *   GET /api/catalog
 *   GET /api/stickers?q=&type=&tag=&limit=&offset=
 *   GET /api/stickers/:id
 *   GET /api/tags
 *   GET /api/random?mood=&type=
 *   GET /stickers/*            original PNG/SVG/WebM bytes (Range supported)
 *   POST /mcp                  MCP Streamable HTTP (JSON responses)
 *
 * Zero dependencies: node:http only.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { handleMcpJsonBody } from '../sticker-mcp/protocol.mjs'
import { catalogSummary, getSticker, listTags, loadCatalog, randomSticker, searchStickers, toApiItem } from '../sticker-catalog/src/query.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const PUBLIC_STICKERS = resolve(repo, 'public/stickers')
const catalog = loadCatalog()
const HOST = process.env.HOST || '127.0.0.1'
const PORT = Number(process.env.PORT ?? 4319)
const MAX_MCP_BODY = 1024 * 1024

const MEDIA_TYPES = new Map([
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webm', 'video/webm'],
  ['.json', 'application/json; charset=utf-8'],
])

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, accept, mcp-session-id, mcp-protocol-version',
    'access-control-expose-headers': 'mcp-session-id, content-range, accept-ranges',
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...corsHeaders(),
  })
  res.end(payload)
}

function sendEmpty(res, status, headers = {}) {
  res.writeHead(status, { ...corsHeaders(), ...headers })
  res.end()
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim() || 'http'
  const host = String(req.headers.host ?? `${HOST}:${PORT}`)
  return `${proto}://${host}`
}

function withOrigin(item, origin) {
  return {
    ...item,
    imageUrl: item.image === null ? null : `${origin}${item.image}`,
    videoUrl: item.video === null ? null : `${origin}${item.video}`,
  }
}

function readRequestBody(req, limit) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handleMcp(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Use POST /mcp' } })
    return
  }
  let raw
  try {
    raw = await readRequestBody(req, MAX_MCP_BODY)
  } catch (error) {
    sendJson(res, 413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: error.message } })
    return
  }
  const result = handleMcpJsonBody(raw)
  if (result.status === 202 || result.body === null) {
    sendEmpty(res, 202)
    return
  }
  const headers = {}
  if (result.body?.result?.protocolVersion !== undefined) headers['mcp-session-id'] = randomUUID()
  const payload = JSON.stringify(result.body)
  res.writeHead(result.status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers,
    ...corsHeaders(),
  })
  res.end(payload)
}

function serveSticker(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  let relative
  try {
    relative = decodeURIComponent(pathname.slice('/stickers/'.length))
  } catch {
    sendJson(res, 400, { ok: false, error: 'bad_path' })
    return
  }
  if (relative.includes('\0') || relative.split('/').some(segment => segment === '..' || segment === '')) {
    sendJson(res, 404, { ok: false, error: 'not_found' })
    return
  }
  const file = resolve(PUBLIC_STICKERS, relative)
  if (!file.startsWith(`${PUBLIC_STICKERS}${sep}`)) {
    sendJson(res, 404, { ok: false, error: 'not_found' })
    return
  }
  if (!existsSync(file)) {
    sendJson(res, 404, { ok: false, error: 'not_found' })
    return
  }
  const stats = statSync(file)
  if (!stats.isFile()) {
    sendJson(res, 404, { ok: false, error: 'not_found' })
    return
  }
  const mediaType = MEDIA_TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream'
  const headers = {
    'content-type': mediaType,
    'cache-control': 'public, max-age=31536000, immutable',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    ...corsHeaders(),
  }
  if (mediaType === 'image/svg+xml') headers['content-security-policy'] = "script-src 'none'"

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
        sendEmpty(res, 416, { 'content-range': `bytes */${stats.size}` })
        return
      }
      start = Math.max(0, stats.size - suffix)
      end = stats.size - 1
    } else {
      start = Number(startText)
      end = endText === '' ? stats.size - 1 : Number(endText)
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= stats.size || end < start) {
      sendEmpty(res, 416, { 'content-range': `bytes */${stats.size}` })
      return
    }
    end = Math.min(end, stats.size - 1)
    res.writeHead(206, {
      ...headers,
      'content-range': `bytes ${start}-${end}/${stats.size}`,
      'content-length': String(end - start + 1),
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file, { start, end }).pipe(res)
    return
  }

  res.writeHead(200, { ...headers, 'content-length': String(stats.size) })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

async function handleRequest(req, res) {
  const url = new URL(String(req.url ?? '/'), 'http://localhost')
  const pathname = url.pathname
  const origin = requestOrigin(req)

  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204)
    return
  }

  if (pathname === '/mcp') {
    await handleMcp(req, res)
    return
  }

  if (pathname === '/health') {
    sendJson(res, 200, { ok: true, ...catalogSummary(catalog) })
    return
  }

  if (pathname === '/') {
    sendJson(res, 200, {
      ok: true,
      name: 'lynn-sticker-api',
      endpoints: ['/health', '/api/catalog', '/api/stickers', '/api/stickers/:id', '/api/tags', '/api/random', '/stickers/*', '/mcp'],
    })
    return
  }

  if (pathname === '/api/catalog') {
    sendJson(res, 200, { ok: true, catalog })
    return
  }

  if (pathname === '/api/tags') {
    sendJson(res, 200, { ok: true, tags: listTags(catalog) })
    return
  }

  if (pathname === '/api/random') {
    const sticker = randomSticker(catalog, { mood: url.searchParams.get('mood') ?? '', type: url.searchParams.get('type') ?? undefined })
    if (sticker === null) {
      sendJson(res, 404, { ok: false, error: 'no_sticker' })
      return
    }
    sendJson(res, 200, { ok: true, sticker: withOrigin(toApiItem(sticker), origin) })
    return
  }

  if (pathname === '/api/stickers') {
    const result = searchStickers(catalog, {
      q: url.searchParams.get('q') ?? '',
      type: url.searchParams.get('type') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    })
    sendJson(res, 200, {
      ok: true,
      total: result.total,
      count: result.count,
      offset: result.offset,
      items: result.items.map(item => withOrigin(item, origin)),
    })
    return
  }

  if (pathname.startsWith('/api/stickers/')) {
    const id = decodeURIComponent(pathname.slice('/api/stickers/'.length))
    const sticker = getSticker(catalog, id)
    if (sticker === null) {
      sendJson(res, 404, { ok: false, error: 'not_found', id })
      return
    }
    sendJson(res, 200, { ok: true, sticker: withOrigin(toApiItem(sticker), origin) })
    return
  }

  if (pathname.startsWith('/stickers/')) {
    serveSticker(req, res, pathname)
    return
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { ok: false, error: 'not_found' })
    return
  }

  sendJson(res, 404, { ok: false, error: 'not_found' })
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    process.stderr.write(`lynn-sticker api: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal_error' })
    else res.destroy()
  })
})

server.listen(PORT, HOST, () => {
  const address = server.address()
  const actualPort = typeof address === 'object' && address !== null ? address.port : PORT
  process.stdout.write(`lynn-sticker api listening on http://${HOST}:${actualPort}\n`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
