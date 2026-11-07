'use client'

import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Image as ImageIcon, Play } from 'lucide-react'
import type { StickerType } from '@/data/stickers'

const tabs = [
  { type: 'static', label: '静态', icon: ImageIcon },
  { type: 'animated', label: '动态', icon: Play },
] as const

interface StickerTabsProps {
  selected: StickerType
  counts: Record<StickerType, number>
  onChange: (type: StickerType) => void
}

export function StickerTabs({ selected, counts, onChange }: StickerTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break
      case 'ArrowLeft': nextIndex = (index + tabs.length - 1) % tabs.length; break
      case 'Home': nextIndex = 0; break
      case 'End': nextIndex = tabs.length - 1; break
      default: return
    }
    event.preventDefault()
    const nextType = tabs[nextIndex].type
    onChange(nextType)
    tabListRef.current?.querySelector<HTMLButtonElement>(`#sticker-tab-${nextType}`)?.focus()
  }

  return (
    <div ref={tabListRef} role="tablist" aria-label="贴纸类型" className="inline-flex gap-1 rounded-full border border-gray-300 bg-gray-100 p-1">
      {tabs.map(({ type, label, icon: Icon }, index) => (
        <button
          key={type}
          id={`sticker-tab-${type}`}
          role="tab"
          aria-selected={selected === type}
          aria-controls="sticker-panel"
          tabIndex={selected === type ? 0 : -1}
          onClick={() => onChange(type)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 ${selected === type ? 'bg-foreground text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
          <span className={selected === type ? 'text-white/70' : 'text-gray-500'}>{counts[type]}</span>
        </button>
      ))}
    </div>
  )
}
