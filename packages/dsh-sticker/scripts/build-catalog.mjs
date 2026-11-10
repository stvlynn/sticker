#!/usr/bin/env node
/**
 * Build the DSH bundle's runtime metadata catalog.
 *
 * The plugin intentionally bundles NO sticker images or WebM loops. It ships
 * only the compact matching metadata (id/title/type/tags/moods/whenToUse plus
 * the site-relative image/video paths); the browser loads the actual media from
 * https://sticker.stv.pm at render time.
 *
 * Output: lib/catalog.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(here, '..')
const repo = resolve(packageDir, '../..')
const catalogPath = join(repo, 'packages/sticker-catalog/catalog.json')
const outputPath = join(packageDir, 'lib/catalog.json')

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const runtime = []
const seen = new Set()

for (const sticker of catalog.stickers) {
  if (typeof sticker.id !== 'string' || sticker.id === '') throw new Error('catalog entry without id')
  if (seen.has(sticker.id)) throw new Error(`duplicate catalog id ${sticker.id}`)
  seen.add(sticker.id)
  if (typeof sticker.image !== 'string' || !sticker.image.startsWith('/')) {
    throw new Error(`sticker ${sticker.id} has no root-relative image path`)
  }
  if (sticker.video !== null && (typeof sticker.video !== 'string' || !sticker.video.startsWith('/'))) {
    throw new Error(`sticker ${sticker.id} has an invalid video path`)
  }
  runtime.push({
    id: sticker.id,
    order: sticker.order,
    title: sticker.title,
    type: sticker.type,
    tags: sticker.tags,
    moods: sticker.moods,
    whenToUse: sticker.whenToUse,
    image: sticker.image,
    video: sticker.video,
  })
}

if (runtime.length !== 261) {
  throw new Error(`expected 261 runtime entries, got ${runtime.length}`)
}
if (!existsSync(join(repo, 'public/catalog.json'))) {
  console.warn('build-catalog: warning: public/catalog.json is missing; remote catalog refresh will 404 until it is deployed')
}

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      packageName: 'dsh-lynn-sticker',
      mediaBaseUrl: 'https://sticker.stv.pm',
      counts: {
        static: runtime.filter(row => row.type === 'static').length,
        animated: runtime.filter(row => row.type === 'animated').length,
        total: runtime.length,
      },
      stickers: runtime,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const bytes = Buffer.byteLength(readFileSync(outputPath))
console.log(
  `build-catalog: wrote ${runtime.length} runtime entries (${(bytes / 1024).toFixed(1)} KB, no bundled media) -> lib/catalog.json`,
)
