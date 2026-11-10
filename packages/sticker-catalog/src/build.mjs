#!/usr/bin/env node
/**
 * Build the canonical sticker catalog from the repository's real assets.
 *
 * Source of truth:
 *   - public/stickers/*.png                       (static sticker images)
 *   - src/data/animated-stickers.json             (published animated manifest)
 *   - public/stickers/animated/*.webm|*.png       (animated media and posters)
 *
 * Output: packages/sticker-catalog/catalog.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { animatedOverride, staticCurated } from './curated.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const staticDir = join(repo, 'public/stickers')
const animatedDir = join(staticDir, 'animated')
const manifestPath = join(repo, 'src/data/animated-stickers.json')
const outputPath = join(repo, 'packages/sticker-catalog/catalog.json')
const publicOutputPath = join(repo, 'public/catalog.json')

const fail = message => {
  console.error(`catalog: ${message}`)
  process.exit(1)
}

const uniq = values => [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
const cleanTitle = value => value.replace(/\.png$/i, '')

if (!existsSync(staticDir)) fail(`missing ${staticDir}`)
if (!existsSync(manifestPath)) fail(`missing ${manifestPath}`)

// ── Static stickers: every PNG actually present, sorted for stable ids ──────
const staticFiles = readdirSync(staticDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.png$/i.test(entry.name))
  .map(entry => entry.name)
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

if (staticFiles.length === 0) fail('no static PNG stickers found')

const stickers = []
const warnings = []

for (const [index, filename] of staticFiles.entries()) {
  const title = cleanTitle(filename)
  const curated = staticCurated[title]
  const tags = uniq(curated?.tags ?? [title, 'sticker', '表情', '贴纸'])
  const moods = uniq(curated?.moods ?? [title])
  const aliases = uniq(curated?.aliases ?? [title])
  const whenToUse = curated?.whenToUse ?? `需要表达「${title}」相关情绪或场景时`
  if (tags.length < 2) warnings.push(`static ${title} has fewer than 2 tags`)
  if (moods.length < 1) warnings.push(`static ${title} has no moods`)
  stickers.push({
    id: `s-${String(index + 1).padStart(2, '0')}`,
    order: index,
    title,
    type: 'static',
    format: 'png',
    tags,
    moods,
    aliases,
    whenToUse,
    source: `public/stickers/${filename}`,
    image: `/stickers/${filename}`,
    video: null,
  })
}

// ── Animated stickers: manifest order, published entries only ───────────────
let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  fail(`cannot parse ${manifestPath}: ${error.message}`)
}

const entries = Array.isArray(manifest?.stickers) ? manifest.stickers : []
if (entries.length === 0) fail('animated manifest has no stickers')

const seenAnimated = new Set()
for (const [index, item] of entries.entries()) {
  const title = String(item.title ?? '').trim()
  if (title === '') fail(`animated entry ${index} has no title`)
  const videoPath = typeof item.videoUrl === 'string' ? item.videoUrl : ''
  const posterPath = typeof item.posterUrl === 'string' ? item.posterUrl : ''
  if (videoPath === '') fail(`animated ${title} has no videoUrl`)
  if (posterPath === '') fail(`animated ${title} has no posterUrl`)
  if (seenAnimated.has(positionKey(item))) fail(`animated ${title} duplicate position`)
  seenAnimated.add(positionKey(item))

  const override = animatedOverride(title)
  const titleTags = title
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(token => token.length >= 2)
  const tags = uniq([...(override?.tags ?? []), ...titleTags])
  if (tags.length < 2) tags.push('sticker', '表情')
  const moods = uniq([...(override?.moods ?? []), ...titleTags, title])
  const aliases = uniq([...(override?.aliases ?? []), ...titleTags, title])
  const whenToUse = override?.whenToUse ?? `需要表达「${title}」相关情绪或场景时`
  stickers.push({
    id: `a-${String(index + 1).padStart(3, '0')}`,
    order: staticFiles.length + index,
    title,
    type: 'animated',
    format: 'webm',
    tags,
    moods,
    aliases,
    whenToUse,
    source: `public${videoPath}`,
    image: posterPath,
    video: videoPath,
    pack: item.pack ?? null,
    position: item.position ?? null,
    bytes: item.bytes ?? null,
    sha256: item.sha256 ?? null,
  })
}

// ── Validation ──────────────────────────────────────────────────────────────
const ids = new Set()
const titles = new Set()
for (const sticker of stickers) {
  if (ids.has(sticker.id)) fail(`duplicate id ${sticker.id}`)
  ids.add(sticker.id)
  const titleKey = `${sticker.type}:${sticker.title}`
  if (titles.has(titleKey)) fail(`duplicate ${titleKey}`)
  titles.add(titleKey)
  if (sticker.tags.length < 2) warnings.push(`${sticker.id} has fewer than 2 tags`)
  if (sticker.moods.length < 1) warnings.push(`${sticker.id} has no moods`)
  const sourcePath = join(repo, sticker.source)
  if (!existsSync(sourcePath)) fail(`missing source for ${sticker.id}: ${sticker.source}`)
  const imagePath = join(repo, 'public', sticker.image)
  if (!existsSync(imagePath)) fail(`missing image for ${sticker.id}: ${sticker.image}`)
  if (sticker.video !== null || sticker.type === 'animated') {
    const videoPath = join(repo, 'public', sticker.video ?? '')
    if (!existsSync(videoPath)) fail(`missing video for ${sticker.id}: ${sticker.video}`)
  }
  if (!sticker.image.startsWith('/')) fail(`${sticker.id} image must be root-relative`)
  if (sticker.video !== null && !sticker.video.startsWith('/')) fail(`${sticker.id} video must be root-relative`)
}

function positionKey(item) {
  return `${item.pack ?? '?'}:${item.position ?? '?'}`
}

if (warnings.length > 0) {
  for (const warning of warnings) console.warn(`catalog: warning: ${warning}`)
  if (warnings.some(warning => warning.includes('fewer than 2 tags') || warning.includes('no moods'))) {
    fail('metadata validation failed')
  }
}

const staticCount = stickers.filter(sticker => sticker.type === 'static').length
const animatedCount = stickers.filter(sticker => sticker.type === 'animated').length
const catalog = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: {
    static: 'public/stickers/*.png',
    animated: 'src/data/animated-stickers.json',
  },
  counts: { static: staticCount, animated: animatedCount, total: stickers.length },
  stickers,
}

writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
writeFileSync(publicOutputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(
  `catalog: wrote ${stickers.length} stickers (${staticCount} static, ${animatedCount} animated) -> ${relative(outputPath)} and public/catalog.json`,
)

function relative(path) {
  return path.startsWith(`${repo}/`) ? path.slice(repo.length + 1) : path
}
