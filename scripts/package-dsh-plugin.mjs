#!/usr/bin/env node
/**
 * Pack the DSH sticker bundle into an installable tarball and verify that the
 * tarball really contains the runtime files and every referenced asset.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
]
const missing = required.filter(entry => !entries.has(entry))

const missingAssets = []
for (const sticker of runtime.stickers) {
  if (!entries.has(`package/lib/assets/${sticker.thumb}`)) missingAssets.push(sticker.thumb)
  if (sticker.video !== null && !entries.has(`package/lib/assets/${sticker.video}`)) missingAssets.push(sticker.video)
}

if (missing.length > 0 || missingAssets.length > 0) {
  console.error(`pack: tarball incomplete; missing files: ${[...missing, ...missingAssets.slice(0, 8)].join(', ')}${missingAssets.length > 8 ? ` (+${missingAssets.length - 8} more)` : ''}`)
  process.exit(1)
}

const bytes = statSync(tarball).size
const generated = totalSize(join(packageDir, 'lib/assets'))
console.log(
  `pack: ${tarball} (${(bytes / 1024 / 1024).toFixed(2)} MB tarball, ${(generated / 1024 / 1024).toFixed(2)} MB assets, ${runtime.stickers.length} stickers, ${entries.size} entries)`,
)

function totalSize(directory) {
  let total = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) total += totalSize(full)
    else if (entry.isFile()) total += statSync(full).size
  }
  return total
}
