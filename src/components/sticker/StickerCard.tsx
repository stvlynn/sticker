'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Copy, Check } from 'lucide-react'
import Image from 'next/image'
import type { Sticker } from '@/data/stickers'

interface StickerCardProps {
  sticker: Sticker
}

export function StickerCard({ sticker }: StickerCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleDownload = async () => {
    const link = document.createElement('a')
    link.href = sticker.pngUrl
    link.download = `${sticker.title}.png`
    link.click()
  }

  const handleCopy = async () => {
    try {
      const response = await fetch(sticker.pngUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy image:', err)
    }
  }

  return (
    <motion.div
      className="relative flex flex-col items-center justify-center p-6 cursor-pointer"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      initial={false}
      animate={{
        y: isHovered ? -8 : 0,
        scale: isHovered ? 1.02 : 1,
      }}
      transition={{
        duration: 0.25,
        ease: 'easeOut',
      }}
      style={{
        filter: isHovered
          ? 'drop-shadow(0 12px 24px rgba(0, 0, 0, 0.12))'
          : 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.06))',
      }}
    >
      {/* Sticker Image */}
      <div className="relative w-full aspect-square flex items-center justify-center">
        <Image
          src={sticker.pngUrl}
          alt={sticker.title}
          width={160}
          height={160}
          className="object-contain"
          style={{
            filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)',
          }}
        />
      </div>

      {/* Title - 使用文件名，hover时隐藏 */}
      <motion.p
        className="mt-3 text-sm font-medium text-foreground text-center"
        initial={{ opacity: 1 }}
        animate={{ opacity: isHovered ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      >
        {sticker.title}
      </motion.p>

      {/* Hover Actions */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 py-2 border-t border-dashed border-gray-300 bg-background/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Copy */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors"
          title="复制到剪贴板"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? '已复制' : '复制'}
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors"
          title="下载图片"
        >
          <Download className="w-3.5 h-3.5" />
          下载
        </button>
      </motion.div>
    </motion.div>
  )
}
