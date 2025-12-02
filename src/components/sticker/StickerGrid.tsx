'use client'

import { StickerCard } from './StickerCard'
import type { Sticker } from '@/data/stickers'

interface StickerGridProps {
  stickers: Sticker[]
}

export function StickerGrid({ stickers }: StickerGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
      {stickers.map((sticker, index) => (
        <div
          key={sticker.id}
          className="relative border-r border-b border-dashed border-gray-300 last:border-r-0 [&:nth-child(2n)]:border-r-0 md:[&:nth-child(2n)]:border-r md:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(3n)]:border-r lg:[&:nth-child(4n)]:border-r-0"
        >
          <StickerCard sticker={sticker} />
        </div>
      ))}
    </div>
  )
}
