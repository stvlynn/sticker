#!/usr/bin/env node
/**
 * End-to-end verification for the sticker agent stack.
 *
 * Checks the catalog, generated stills, DSH bundle assets/manifests, the REST
 * API, the MCP stdio server, and the HTTP /mcp endpoint. Prints PASS lines and
 * exits non-zero on the first failed group.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { matchSticker } from '../packages/sticker-catalog/src/match.mjs'
import { apply as applyStickerHost } from '../packages/dsh-sticker/lib/index.js'
import { createInterface } from 'node:readline'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const catalogPath = join(repo, 'packages/sticker-catalog/catalog.json')
const thumbsManifestPath = join(repo, 'packages/sticker-catalog/assets/thumbs.json')
const dshDir = join(repo, 'packages/dsh-sticker')
const dshCatalogPath = join(dshDir, 'lib/catalog.json')

let passed = 0
let failed = 0
let skipped = 0
const failures = []

function check(condition, message) {
  if (condition) {
    passed++
    console.log(`PASS ${message}`)
  } else {
    failed++
    failures.push(message)
    console.error(`FAIL ${message}`)
  }
}

function checkGroup(name, fn) {
  try {
    fn()
  } catch (error) {
    failed++
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`FAIL ${name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function validWebp(file) {
  const bytes = readFileSync(file)
  return bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
}

function totalSize(directory) {
  let total = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) total += totalSize(full)
    else if (entry.isFile()) total += statSync(full).size
  }
  return total
}

// ── Catalog ────────────────────────────────────────────────────────────────
checkGroup('catalog', () => {
  assert(existsSync(catalogPath), 'catalog.json missing; run npm run stickers:catalog')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  check(catalog.counts.static === 80, `catalog static count is 80 (got ${catalog.counts.static})`)
  check(catalog.counts.animated === 181, `catalog animated count is 181 (got ${catalog.counts.animated})`)
  check(catalog.stickers.length === 261, `catalog total is 261 (got ${catalog.stickers.length})`)
  const ids = new Set()
  const titles = new Set()
  let metadataIssues = 0
  let missingSources = 0
  for (const sticker of catalog.stickers) {
    if (ids.has(sticker.id)) throw new Error(`duplicate id ${sticker.id}`)
    ids.add(sticker.id)
    const titleKey = `${sticker.type}:${sticker.title}`
    if (titles.has(titleKey)) throw new Error(`duplicate title ${titleKey}`)
    titles.add(titleKey)
    if (!Array.isArray(sticker.tags) || sticker.tags.length < 2) metadataIssues++
    if (!Array.isArray(sticker.moods) || sticker.moods.length < 1) metadataIssues++
    if (!existsSync(join(repo, sticker.source))) missingSources++
    if (!sticker.image.startsWith('/')) metadataIssues++
    if (sticker.video !== null && !sticker.video.startsWith('/')) metadataIssues++
  }
  check(metadataIssues === 0, `every catalog entry has >=2 tags, >=1 mood and root-relative media (${metadataIssues} issues)`)
  check(missingSources === 0, `every catalog source file exists (${missingSources} missing)`)
  check(matchSticker(catalog, '开心').match?.type === 'animated', 'matcher prefers an animated sticker for 开心')
  check(matchSticker(catalog, '摸鱼').match?.type === 'static', 'matcher keeps a clearly better static sticker for 摸鱼')
})

// ── Shared stills ─────────────────────────────────────────────────────────
checkGroup('shared stills', () => {
  assert(existsSync(thumbsManifestPath), 'thumbs.json missing; run npm run stickers:thumbs')
  const manifest = JSON.parse(readFileSync(thumbsManifestPath, 'utf8'))
  check(manifest.count === 261, `thumbs manifest has 261 entries (got ${manifest.count})`)
  const thumbsDir = join(repo, 'packages/sticker-catalog/assets/thumbs')
  const files = readdirSync(thumbsDir).filter(file => file.endsWith('.webp'))
  check(files.length === 261, `thumbs directory has 261 WebP files (got ${files.length})`)
  let invalid = 0
  for (const file of files) if (!validWebp(join(thumbsDir, file))) invalid++
  check(invalid === 0, `every still is a real WebP file (${invalid} invalid)`)
  check(totalSize(thumbsDir) <= 12 * 1024 * 1024, `still budget <= 12 MB (${(totalSize(thumbsDir) / 1024 / 1024).toFixed(2)} MB)`)
})

// ── DSH bundle ────────────────────────────────────────────────────────────
checkGroup('dsh bundle', () => {
  assert(existsSync(dshCatalogPath), 'dsh runtime catalog missing; run npm run stickers:build')
  for (const file of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'icon.png', 'locale/en.json', 'locale/zh.json', 'package.json', 'LICENSE']) {
    check(existsSync(join(dshDir, file)), `dsh bundle contains ${file}`)
  }
  for (const file of ['lib/index.js', 'lib/client.js', 'scripts/build-catalog.mjs']) {
    const result = spawnSync('node', ['--check', join(dshDir, file)], { encoding: 'utf8' })
    check(result.status === 0, `node --check ${file}`)
  }
  const clientSource = readFileSync(join(dshDir, 'lib/client.js'), 'utf8')
  check(clientSource.includes('conversation.chat.turnTail') && clientSource.includes('selectStickerForTurn'), 'client registers a visible turn-tail sticker renderer')
  check(clientSource.includes("useProjection('lynnStickerAuto')"), 'client reads the auto-sticker projection')
  const manifest = JSON.parse(readFileSync(join(dshDir, 'package.json'), 'utf8'))
  check(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'package.json declares dsh.bundle.patch')
  check(manifest.dsh?.client?.platform === 'web', 'package.json declares dsh.client.platform=web')
  check(manifest.exports?.['./assets/*'] === undefined, 'package.json bundles no media assets')
  check(Array.isArray(manifest.files) && !manifest.files.some(file => file.includes('assets')), 'package files exclude media assets')
  check(!existsSync(join(dshDir, 'lib/assets')), 'plugin package contains no lib/assets directory')
  check(statSync(join(dshDir, 'icon.png')).size <= 256 * 1024, 'icon is <= 256 KiB')
  for (const locale of ['en', 'zh']) {
    const data = JSON.parse(readFileSync(join(dshDir, 'locale', `${locale}.json`), 'utf8'))
    check(typeof data.meta?.title === 'string' && typeof data.meta?.description === 'string', `locale/${locale}.json has meta title/description`)
  }

  const runtime = JSON.parse(readFileSync(dshCatalogPath, 'utf8'))
  check(runtime.stickers.length === 261, `dsh runtime catalog has 261 entries (got ${runtime.stickers.length})`)
  let invalidPaths = 0
  let videoCount = 0
  for (const sticker of runtime.stickers) {
    if (typeof sticker.image !== 'string' || !sticker.image.startsWith('/')) invalidPaths++
    if (sticker.video !== null && (typeof sticker.video !== 'string' || !sticker.video.startsWith('/'))) invalidPaths++
    if (sticker.video !== null) videoCount++
    if ('thumb' in sticker) invalidPaths++
  }
  check(invalidPaths === 0, `every runtime entry uses site-relative image/video paths only (${invalidPaths} invalid)`)
  check(videoCount === 181, `all 181 animated stickers have a remote WebM path (got ${videoCount})`)
  const libSize = totalSize(join(dshDir, 'lib'))
  check(libSize <= 1024 * 1024, `plugin runtime files stay <= 1 MB without media (${(libSize / 1024).toFixed(0)} KB)`)

  const publicCatalogPath = join(repo, 'public/catalog.json')
  check(existsSync(publicCatalogPath), 'public/catalog.json exists for remote catalog refresh')
  if (existsSync(publicCatalogPath)) {
    const publicCatalog = JSON.parse(readFileSync(publicCatalogPath, 'utf8'))
    const canonical = JSON.parse(readFileSync(catalogPath, 'utf8'))
    const ids = new Set(canonical.stickers.map(sticker => sticker.id))
    check(publicCatalog.stickers.length === 261, `public/catalog.json has 261 entries (got ${publicCatalog.stickers.length})`)
    check(publicCatalog.stickers.every(sticker => ids.has(sticker.id)), 'public/catalog.json ids match the canonical catalog')
  }
})

// ── API + HTTP MCP ────────────────────────────────────────────────────────
async function startApi() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [join(repo, 'packages/sticker-api/server.mjs')], {
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error('API server did not report its listening URL within 10s'))
    }, 10000)
    const onLine = line => {
      const match = /listening on (http:\/\/[^\s]+)/u.exec(line)
      if (match === null || settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ child, origin: match[1] })
    }
    createInterface({ input: child.stdout }).on('line', onLine)
    createInterface({ input: child.stderr }).on('line', line => process.stderr.write(`api stderr: ${line}\n`))
    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`API server exited early with code ${code}`))
    })
  })
}

async function testApi() {
  const { child, origin } = await startApi()
  try {
    const get = async (path, options = {}) => {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(8000), ...options })
      return response
    }
    const json = async (path, options) => {
      const response = await get(path, options)
      const body = await response.json()
      return { response, body }
    }

    const health = await json('/health')
    check(health.response.ok && health.body.total === 261, `GET /health reports 261 stickers (got ${health.body.total})`)
    check(health.response.headers.get('access-control-allow-origin') === '*', 'API sets CORS on JSON responses')

    const search = await json('/api/stickers?q=%E6%91%B8%E9%B1%BC&limit=3')
    check(search.response.ok && search.body.total >= 1, 'GET /api/stickers?q=摸鱼 returns a match')
    check(search.body.items[0]?.title === '摸鱼', 'search result for 摸鱼 is the 摸鱼 sticker first')
    check(search.body.items[0]?.imageUrl?.startsWith(origin), 'API builds absolute image URLs')

    const preferred = await json('/api/stickers?q=%E5%BC%80%E5%BF%83&limit=1')
    check(preferred.body.items[0]?.type === 'animated', 'REST search prefers an animated sticker for 开心')

    const animated = await json('/api/stickers?type=animated&limit=5')
    check(animated.response.ok && animated.body.items.every(item => item.type === 'animated'), 'GET /api/stickers?type=animated filters animated stickers')

    const lookup = await json('/api/stickers/s-01')
    check(lookup.response.ok && lookup.body.sticker.id === 's-01', 'GET /api/stickers/s-01 returns the sticker')

    const missing = await get('/api/stickers/does-not-exist')
    check(missing.status === 404, 'unknown sticker id returns 404')

    const tags = await json('/api/tags')
    check(tags.response.ok && tags.body.tags.length > 50, 'GET /api/tags returns the tag vocabulary')

    const random = await json('/api/random?mood=%E5%8A%A0%E7%8F%AD')
    check(random.response.ok && typeof random.body.sticker?.title === 'string', 'GET /api/random?mood=加班 returns a sticker')

    const image = await get(`/stickers/${encodeURIComponent('摸鱼.png')}`)
    const imageBytes = Buffer.from(await image.arrayBuffer())
    check(image.status === 200 && image.headers.get('content-type') === 'image/png' && imageBytes.length > 1000, 'GET /stickers/<original png> serves PNG bytes')

    const video = await get('/stickers/animated/001-Alert-Bits.webm', { headers: { range: 'bytes=0-99' } })
    check(video.status === 206 && Number(video.headers.get('content-length')) === 100, 'GET animated WebM supports a 100-byte Range request')

    const traversal = await get('/stickers/%2e%2e%2fetc%2fpasswd')
    check(traversal.status === 404, 'path traversal through /stickers is rejected')

    const mcpInit = await json('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '1.0.0' } },
      }),
    })
    check(mcpInit.response.ok && mcpInit.body.result?.serverInfo?.name === 'lynn-sticker', 'POST /mcp initializes with serverInfo=lynn-sticker')
    check((mcpInit.response.headers.get('mcp-session-id') ?? '') !== '', 'POST /mcp returns Mcp-Session-Id on initialize')

    const mcpTools = await json('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    })
    check(mcpTools.body.result?.tools?.length === 4, 'POST /mcp tools/list returns 4 tools')

    const mcpImage = await json('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_sticker', arguments: { id: 's-65' } } }),
    })
    const imageBlock = mcpImage.body.result?.content?.find(block => block.type === 'image')
    const decoded = imageBlock === undefined ? Buffer.alloc(0) : Buffer.from(imageBlock.data, 'base64')
    check(decoded.length > 1000 && decoded.toString('ascii', 0, 4) === 'RIFF' && decoded.toString('ascii', 8, 12) === 'WEBP', 'MCP get_sticker returns a WebP image block')
  } finally {
    child.kill('SIGTERM')
    await new Promise(resolvePromise => child.once('exit', resolvePromise))
  }
}

// ── MCP stdio ─────────────────────────────────────────────────────────────
async function testMcpStdio() {
  const child = spawn('node', [join(repo, 'packages/sticker-mcp/server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] })
  const responses = new Map()
  try {
    const lineReader = createInterface({ input: child.stdout })
    const waiters = new Map()
    lineReader.on('line', line => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      responses.set(message.id, message)
      const waiter = waiters.get(message.id)
      if (waiter !== undefined) {
        waiters.delete(message.id)
        waiter(message)
      }
    })
    createInterface({ input: child.stderr }).on('line', line => {
      if (!line.includes('ready')) process.stderr.write(`mcp stderr: ${line}\n`)
    })
    const request = (message, timeoutMs = 8000) =>
      new Promise((resolvePromise, reject) => {
        const timeout = setTimeout(() => reject(new Error(`MCP request ${message.method} timed out`)), timeoutMs)
        waiters.set(message.id, response => {
          clearTimeout(timeout)
          resolvePromise(response)
        })
        child.stdin.write(`${JSON.stringify(message)}\n`)
      })

    const init = await request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '1.0.0' } },
    })
    check(init.result?.serverInfo?.name === 'lynn-sticker', 'MCP stdio initialize returns serverInfo')
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)

    const tools = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    check(tools.result?.tools?.length === 4, 'MCP stdio tools/list returns 4 tools')

    const search = await request({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search_stickers', arguments: { query: '摸鱼', limit: 2 } },
    })
    check(search.result?.content?.[0]?.text?.includes('s-65'), 'MCP search_stickers finds s-65 for 摸鱼')
    check(!search.result?.content?.some(block => block.type === 'image'), 'MCP search_stickers returns text only')

    const sticker = await request({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_sticker', arguments: { id: 's-65' } },
    })
    const image = sticker.result?.content?.find(block => block.type === 'image')
    const bytes = image === undefined ? Buffer.alloc(0) : Buffer.from(image.data, 'base64')
    check(bytes.length > 1000 && bytes.toString('ascii', 0, 4) === 'RIFF', 'MCP get_sticker returns a real WebP image')
  } finally {
    child.stdin.end()
    child.kill('SIGKILL')
  }
}

// ── Remote media / catalog (deployment-dependent; skipped when unreachable) ─
async function testRemoteMedia() {
  const base = (process.env.LYNN_STICKER_BASE_URL || 'https://sticker.stv.pm').replace(/\/+$/u, '')
  const media = [
    `${base}/stickers/${encodeURIComponent('摸鱼.png')}`,
    `${base}/stickers/animated/001-Alert-Bits.webm`,
  ]
  for (const url of media) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) })
      check(response.ok, `remote media reachable: ${url} (${response.status})`)
    } catch (error) {
      skipped++
      console.log(`SKIP remote media (${error instanceof Error ? error.message : String(error)}): ${url}`)
    }
  }
  try {
    const response = await fetch(`${base}/catalog.json`, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) {
      skipped++
      console.log(`SKIP remote catalog (${response.status}): ${base}/catalog.json; deploy public/catalog.json to enable it`)
      return
    }
    const payload = await response.json()
    check(payload.stickers?.length === 261, `remote /catalog.json serves 261 entries (got ${payload.stickers?.length})`)
  } catch (error) {
    skipped++
    console.log(`SKIP remote catalog (${error instanceof Error ? error.message : String(error)}): ${base}/catalog.json`)
  }
}

// ── Auto-sticker projection / task hooks ──────────────────────────────────
async function testAutoProjection() {
  let projection
  const ctx = {
    effect: fn => { const clean = fn(); return typeof clean === 'function' ? clean : () => {} },
    tools: { register: () => () => {}, get: () => undefined },
    systemPrompt: { section: () => () => {}, getSectionOrder: () => 0 },
    sessionProjections: { register: async definition => { projection = definition; return { dispose: async () => {} } } },
    inject: () => {},
    get: () => undefined,
  }
  await applyStickerHost(ctx)
  check(projection?.key === 'lynnStickerAuto', 'host registers the lynnStickerAuto projection')
  if (projection === undefined) return
  const event = (type, data) => ({ type, data, seq: 0, time: 0 })
  const fold = events => {
    let state = projection.init({}, 0)
    for (const item of events) state = projection.apply(state, item)
    return projection.wire.view(state)
  }
  const base = [event('turn/start', { turn: 1 })]
  const user = text => event('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text }] })
  const toolCall = (callId, name) => event('tool/call', { turn: 1, callId, name, arguments: '{}' })
  const toolResult = (callId, isError = false) => event('tool/result', { turn: 1, message: { toolCallId: callId, isError, content: [] } })
  const assistant = text => event('assistant/message', { turn: 1, message: { content: [{ type: 'text', text }] } })
  const end = () => event('turn/end', { turn: 1 })

  check(fold([...base, user('谢谢你'), end()])['1']?.title === '贴贴', 'auto hook: thanks message selects 贴贴')
  check(fold([...base, user('你好'), end()])['1']?.type === 'animated', 'auto hook: greeting prefers an animated sticker')
  const task = fold([...base, user('帮我修一下这个功能'), toolCall('c1', 'edit'), toolResult('c1'), assistant('已修复完成'), end()])
  check(task['1']?.title === 'Celebration', 'auto hook: completed task selects Celebration')
  const failed = fold([...base, user('帮我修一下这个功能'), toolCall('c1', 'edit'), toolResult('c1', true), assistant('失败了'), end()])
  check(failed['1']?.title === 'This Is Fine 1', 'auto hook: failed task selects This Is Fine')
  check(fold([...base, user('不要发表情包'), end()])['1'] === null, 'auto hook: explicit refusal selects nothing')
  check(fold([...base, user('sticker列表是硬编码的还是动态检索的'), end()])['1'] === null, 'auto hook: technical/meta discussion selects nothing')
  const manual = fold([...base, user('谢谢你'), toolCall('c1', 'send_sticker'), toolResult('c1'), end()])
  check(manual['1'] === null, 'auto hook: manual send_sticker suppresses the auto sticker')
}

// ── Run async suites ──────────────────────────────────────────────────────
try {
  await testAutoProjection()
} catch (error) {
  failed++
  failures.push(`auto projection: ${error instanceof Error ? error.message : String(error)}`)
  console.error(`FAIL auto projection: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
}

try {
  await testApi()
} catch (error) {
  failed++
  failures.push(`API: ${error instanceof Error ? error.message : String(error)}`)
  console.error(`FAIL API: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
}

try {
  await testRemoteMedia()
} catch (error) {
  failed++
  failures.push(`remote media: ${error instanceof Error ? error.message : String(error)}`)
  console.error(`FAIL remote media: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
}

try {
  await testMcpStdio()
} catch (error) {
  failed++
  failures.push(`MCP stdio: ${error instanceof Error ? error.message : String(error)}`)
  console.error(`FAIL MCP stdio: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${passed} checks passed, ${failed} failed, ${skipped} skipped`)
if (failed > 0) {
  console.error(`Failures:\n${failures.map(failure => `  - ${failure}`).join('\n')}`)
  process.exit(1)
}
