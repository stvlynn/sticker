'use client'

import { useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { Hero } from '@/components/layout/Hero'
import { Footer } from '@/components/layout/Footer'
import { StickerGrid } from '@/components/sticker/StickerGrid'
import { StickerTabs } from '@/components/sticker/StickerTabs'
import { staticStickers, animatedStickers } from '@/data/stickers'
import type { StickerType } from '@/data/stickers'

const stickersByType = { static: staticStickers, animated: animatedStickers }
const stickerCounts = { static: staticStickers.length, animated: animatedStickers.length }

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [stickerType, setStickerType] = useState<StickerType>('static')

  // 模糊搜索过滤
  const filteredStickers = useMemo(() => {
    const stickers = stickersByType[stickerType]
    if (!searchQuery.trim()) return stickers

    const query = searchQuery.trim().toLowerCase()
    return stickers.filter((sticker) => {
      const title = sticker.title.toLowerCase()
      return title.includes(query)
    })
  }, [searchQuery, stickerType])

  return (
    <>
      <Header onSearch={setSearchQuery} />
      <main>
        <Hero />
        <section className="pb-20">
          <div className="max-w-6xl mx-auto px-4">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-dashed border-gray-300 pb-6">
              <StickerTabs selected={stickerType} counts={stickerCounts} onChange={setStickerType} />
              <p className="text-sm text-gray-500" role="status">
                {searchQuery.trim() ? `找到 ${filteredStickers.length} 张贴纸` : stickerType === 'animated' ? '181 张动态贴纸 · 来自 Telegram 的两个贴纸包' : `${staticStickers.length} 张静态贴纸 · PNG 下载与复制`}
              </p>
            </div>
            <div id="sticker-panel" role="tabpanel" aria-labelledby={`sticker-tab-${stickerType}`} tabIndex={0} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-400">
              {filteredStickers.length > 0 ? (
                <StickerGrid stickers={filteredStickers} />
              ) : (
                <div className="text-center py-20 text-gray-500">
                  没有找到匹配的{stickerType === 'animated' ? '动态' : '静态'}贴纸「{searchQuery}」
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
