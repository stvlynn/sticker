'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Download, Copy, Check, Send } from 'lucide-react'
import Image from 'next/image'
import type { Sticker } from '@/data/stickers'
import { AnimatedStickerPreview } from './AnimatedStickerPreview'

interface StickerCardProps {
  sticker: Sticker
}

export function StickerCard({ sticker }: StickerCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const reducedMotion = useReducedMotion()
  const downloadUrl = sticker.type === 'animated' ? sticker.videoUrl : sticker.pngUrl

  const handleCopy = async () => {
    if (sticker.type !== 'static') return
    setCopyFailed(false)
    try {
      const response = await fetch(sticker.pngUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setCopyFailed(true)
      console.error('Failed to copy image:', err)
    }
  }

  return (
    <motion.div
      className="group relative flex flex-col items-center justify-center p-6"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      initial={false}
      animate={{
        y: isHovered && !reducedMotion ? -8 : 0,
        scale: isHovered && !reducedMotion ? 1.02 : 1,
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
      <div className="relative w-full aspect-square flex items-center justify-center">
        {sticker.type === 'animated' ? (
          <AnimatedStickerPreview sticker={sticker} />
        ) : (
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
        )}
      </div>

      <p
        className="mt-3 text-sm font-medium text-foreground text-center"
      >
        {sticker.title}
      </p>

      <div
        className="sticker-actions mt-3 flex min-h-9 flex-wrap items-center justify-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
      >
        {sticker.type === 'static' ? (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-2 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors focus-visible:outline focus-visible:outline-2"
            title="复制到剪贴板"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span aria-live="polite">{copied ? '已复制' : copyFailed ? '复制失败，请下载' : '复制'}</span>
          </button>
        ) : (
          <a
            href={sticker.packUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors focus-visible:outline focus-visible:outline-2"
            aria-label={`在 Telegram 添加 ${sticker.title} 所在贴纸包`}
          >
            <Send className="w-3.5 h-3.5" />
            Telegram
          </a>
        )}

        <a
          href={downloadUrl}
          download={downloadUrl.split('/').pop()}
          className="flex items-center gap-1 px-2 py-2 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors focus-visible:outline focus-visible:outline-2"
          aria-label={`下载 ${sticker.title} (${sticker.type === 'animated' ? 'WebM' : 'PNG'})`}
        >
          <Download className="w-3.5 h-3.5" />
          {sticker.type === 'animated' ? 'WebM' : '下载'}
        </a>
      </div>
    </motion.div>
  )
}
