#!/usr/bin/env node
/**
 * Pack the DSH sticker bundle into an installable tarball and verify that the
 * tarball really contains the runtime files and every referenced asset.
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const packageDir = join(repo, 'packages/dsh-sticker')
const distDir = join(repo, 'dist')
const runtimeCatalogPath = join(packageDir, 'lib/catalog.json')

if (!existsSync(runtimeCatalogPath)) {
  console.error('pack: missing lib/catalog.json; run `npm run stickers:build` first')
  process.exit(1)
}
mkdirSync(distDir, { recursive: true })

const pack = spawnSync('npm', ['pack', '--pack-destination', distDir], {
  cwd: packageDir,
  encoding: 'utf8',
})
if (pack.status !== 0) {
  console.error(`pack: npm pack failed\n${pack.stderr ?? ''}`)
  process.exit(1)
}
const tarballName = (pack.stdout ?? '')
  .trim()
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.endsWith('.tgz'))
  .at(-1)
if (tarballName === undefined) {
  console.error(`pack: cannot find the produced tarball in npm output:\n${pack.stdout}`)
  process.exit(1)
}
const tarball = join(distDir, tarballName)
if (!existsSync(tarball)) {
  console.error(`pack: expected tarball missing: ${tarball}`)
  process.exit(1)
}

const tar = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
if (tar.status !== 0) {
  console.error(`pack: tar verification failed\n${tar.stderr ?? ''}`)
  process.exit(1)
}
const entries = new Set((tar.stdout ?? '').split('\n').map(line => line.trim()).filter(Boolean))
const runtime = JSON.parse(readFileSync(runtimeCatalogPath, 'utf8'))

const required = [
  'package/lib/index.js',
  'package/lib/client.js',
  'package/lib/catalog.json',
  'package/cordis.patch.yml',
  'package/icon.png',
  'package/locale/en.json',
  'package/locale/zh.json',
  'package/LICENSE',
]
const missing = required.filter(entry => !entries.has(entry))
const bundledAssets = [...entries].filter(entry => entry.startsWith('package/lib/assets/'))

if (missing.length > 0) {
  console.error(`pack: tarball incomplete; missing files: ${missing.join(', ')}`)
  process.exit(1)
}
if (bundledAssets.length > 0) {
  console.error(`pack: tarball unexpectedly bundles ${bundledAssets.length} sticker media file(s); media must load from sticker.stv.pm`)
  process.exit(1)
}
if (!runtime.stickers.every(sticker => typeof sticker.image === 'string' && sticker.image.startsWith('/'))) {
  console.error('pack: catalog entries must reference site-relative media paths')
  process.exit(1)
}

const bytes = statSync(tarball).size
console.log(
  `pack: ${tarball} (${(bytes / 1024).toFixed(0)} KB tarball, no bundled sticker media, ${runtime.stickers.length} metadata entries, ${entries.size} files)`,
)
