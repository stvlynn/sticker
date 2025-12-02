'use client'

import { useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { Hero } from '@/components/layout/Hero'
import { Footer } from '@/components/layout/Footer'
import { StickerGrid } from '@/components/sticker/StickerGrid'
import { stickers } from '@/data/stickers'

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')

  // 模糊搜索过滤
  const filteredStickers = useMemo(() => {
    if (!searchQuery.trim()) return stickers

    const query = searchQuery.toLowerCase()
    return stickers.filter((sticker) => {
      // 支持拼音首字母、中文、英文模糊匹配
      const title = sticker.title.toLowerCase()
      return title.includes(query)
    })
  }, [searchQuery])

  return (
    <>
      <Header onSearch={setSearchQuery} />
      <main>
        <Hero />
        <section className="pb-20">
          <div className="max-w-6xl mx-auto px-4">
            {filteredStickers.length > 0 ? (
              <StickerGrid stickers={filteredStickers} />
            ) : (
              <div className="text-center py-20 text-gray-500">
                没有找到匹配的贴纸 "{searchQuery}"
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
