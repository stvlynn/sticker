'use client'

import { useEffect, useRef, useState } from 'react'
import type { AnimatedSticker } from '@/data/stickers'

export function AnimatedStickerPreview({ sticker }: { sticker: AnimatedSticker }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [needsControls, setNeedsControls] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    let disposed = false

    const syncPlayback = () => {
      if (visible && !video.poster) video.poster = sticker.posterUrl
      if (reducedMotion.matches) {
        video.pause()
        if (video.hasAttribute('src')) {
          video.removeAttribute('src')
          video.load()
        }
        return
      }
      if (!visible || document.hidden) {
        video.pause()
        return
      }
      if (!video.hasAttribute('src')) video.src = sticker.videoUrl
      video.play().catch((error: DOMException) => {
        if (!disposed && error.name !== 'AbortError') setNeedsControls(true)
      })
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      syncPlayback()
    }, { threshold: 0.1 })
    observer.observe(video)
    reducedMotion.addEventListener('change', syncPlayback)
    document.addEventListener('visibilitychange', syncPlayback)
    return () => {
      disposed = true
      observer.disconnect()
      reducedMotion.removeEventListener('change', syncPlayback)
      document.removeEventListener('visibilitychange', syncPlayback)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [sticker.videoUrl, sticker.posterUrl])

  return (
    <video
      ref={videoRef}
      aria-label={sticker.title}
      width={160}
      height={160}
      className="h-40 w-40 max-w-full object-contain"
      muted
      loop
      playsInline
      preload="none"
      controls={needsControls}
    />
  )
}
