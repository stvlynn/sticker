import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const source = resolve(process.argv[2] || join(homedir(), 'code/OpenSticker/.workspace/lynn-telegram'))
const plan = JSON.parse(await readFile(join(source, 'pack-plan.json'), 'utf8'))
const published = JSON.parse(await readFile(join(source, 'published.json'), 'utf8'))
const destination = join(project, 'public/stickers/animated')
await mkdir(destination, { recursive: true })

const packs = []
const stickers = []
for (const pack of plan) {
  const publication = published.find((item) => item.name === pack.name)
  if (!publication || publication.count !== pack.stickers.length) {
    throw new Error(`Published pack does not match manifest: ${pack.name}`)
  }
  packs.push({ number: pack.number, title: publication.title, url: publication.url, count: publication.count })
  for (const sticker of pack.stickers) {
    const video = await readFile(join(source, 'packs', String(pack.number).padStart(2, '0'), 'approved', sticker.uploadFilename))
    const sha256 = createHash('sha256').update(video).digest('hex')
    if (sha256 !== sticker.sha256) throw new Error(`Checksum mismatch: ${sticker.filename}`)
    const posterName = sticker.filename.replace(/\.webm$/, '.png')
    const poster = await readFile(join(source, 'review-frames', sticker.samples[1]))
    await writeFile(join(destination, sticker.filename), video)
    await writeFile(join(destination, posterName), poster)
    stickers.push({
      id: sticker.id,
      title: sticker.name,
      pack: pack.number,
      position: sticker.position,
      videoUrl: `/stickers/animated/${sticker.filename}`,
      posterUrl: `/stickers/animated/${posterName}`,
      bytes: video.length,
      sha256,
    })
  }
}
if (new Set(stickers.map((sticker) => sticker.id)).size !== stickers.length) {
  throw new Error('Duplicate animated sticker IDs')
}
await writeFile(join(project, 'src/data/animated-stickers.json'), JSON.stringify({ packs, stickers }, null, 2) + '\n')
console.log(`Synchronized ${stickers.length} published stickers from ${packs.length} packs`)
