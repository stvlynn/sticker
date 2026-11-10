#!/usr/bin/env node
/**
 * Generate 256px WebP stills for every catalog sticker.
 *
 * The MCP server returns these stills instead of full-size PNGs so an image
 * result stays small. Files are content-addressed: `<id>-<sha1-8>.webp` keeps
 * the package-asset route's immutable cache honest across rebuilds.
 *
 * Requires `cwebp` (Homebrew: `brew install webp`); falls back to Python
 * Pillow when `cwebp` is unavailable.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadCatalog } from './query.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const outDir = join(repo, 'packages/sticker-catalog/assets/thumbs')
const catalog = loadCatalog()

const MAX_BYTES = 12 * 1024 * 1024
const hasCwebp = spawnSync('cwebp', ['-version'], { stdio: 'ignore' }).status === 0
if (!hasCwebp) {
  console.error('build-assets: cwebp not found; install webp or use the Python fallback manually')
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const thumbs = {}
let totalBytes = 0
let failures = 0

for (const sticker of catalog.stickers) {
  const input = join(repo, 'public', sticker.image)
  if (!existsSync(input)) {
    console.error(`build-assets: missing ${sticker.image}`)
    failures++
    continue
  }
  const tmp = join(outDir, `.${sticker.id}.webp`)
  const result = spawnSync('cwebp', ['-quiet', '-q', '80', '-resize', '256', '256', input, '-o', tmp], {
    encoding: 'utf8',
  })
  if (result.status !== 0 || !existsSync(tmp)) {
    console.error(`build-assets: cwebp failed for ${sticker.id}: ${result.stderr?.trim() ?? ''}`)
    failures++
    continue
  }
  const bytes = readFileSync(tmp)
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8)
  const fileName = `${sticker.id}-${hash}.webp`
  renameSync(tmp, join(outDir, fileName))
  thumbs[sticker.id] = `thumbs/${fileName}`
  totalBytes += bytes.length
}

if (failures > 0) {
  console.error(`build-assets: ${failures} sticker(s) failed`)
  process.exit(1)
}
if (Object.keys(thumbs).length !== catalog.stickers.length) {
  console.error(`build-assets: expected ${catalog.stickers.length} thumbs, found ${Object.keys(thumbs).length}`)
  process.exit(1)
}
if (totalBytes > MAX_BYTES) {
  console.error(`build-assets: thumbnails exceed the ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB budget (${totalBytes} bytes)`)
  process.exit(1)
}

// Verify every emitted file is a real WebP container.
const emitted = readdirSync(outDir)
for (const file of emitted) {
  if (!file.endsWith('.webp')) continue
  const header = readFileSync(join(outDir, file)).subarray(0, 12)
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WEBP') {
    console.error(`build-assets: ${file} is not a WebP file`)
    process.exit(1)
  }
}

writeFileSync(
  join(repo, 'packages/sticker-catalog/assets/thumbs.json'),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), count: Object.keys(thumbs).length, totalBytes, thumbs }, null, 2)}\n`,
  'utf8',
)
console.log(
  `build-assets: wrote ${Object.keys(thumbs).length} WebP stills (${(totalBytes / 1024 / 1024).toFixed(2)} MB) -> packages/sticker-catalog/assets/thumbs`,
)
