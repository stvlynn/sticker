'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X, Github, Twitter } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface HeaderProps {
  onSearch?: (query: string) => void
}

export function Header({ onSearch }: HeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAboutMenuOpen, setIsAboutMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const aboutMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isSearchOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aboutMenuRef.current && !aboutMenuRef.current.contains(event.target as Node)) {
        setIsAboutMenuOpen(false)
      }
    }

    if (isAboutMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isAboutMenuOpen])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    onSearch?.(value)
  }

  const handleClear = () => {
    setSearchQuery('')
    onSearch?.('')
    inputRef.current?.focus()
  }

  const handleClose = () => {
    setIsSearchOpen(false)
    setSearchQuery('')
    onSearch?.('')
  }

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo / Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-heading font-bold">Lynn-chan Stickers</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-foreground hover:text-gray-600 transition-colors"
          >
            Wall*
          </Link>
          <a
            href="https://blog.stv.pm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-gray-500 hover:text-foreground transition-colors"
          >
            Blog
          </a>
          <div
            ref={aboutMenuRef}
            className="relative"
            onMouseEnter={() => setIsAboutMenuOpen(true)}
            onMouseLeave={() => setIsAboutMenuOpen(false)}
          >
            <button className="text-sm font-medium text-gray-500 hover:text-foreground transition-colors">
              About
            </button>

            <AnimatePresence>
              {isAboutMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50"
                >
                  <a
                    href="https://x.com/Stv_Lynn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Twitter className="w-4 h-4" />
                    <span>X: x.com/Stv_Lynn</span>
                  </a>
                  <a
                    href="https://github.com/stvlynn/lynn-chan"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
                  >
                    <Github className="w-4 h-4" />
                    <span>Star this project</span>
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        {/* Search */}
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {isSearchOpen ? (
              <motion.div
                key="search-input"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 240, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative flex items-center"
              >
                <Search className="absolute left-3 w-4 h-4 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="搜索贴纸..."
                  className="w-full pl-9 pr-8 py-2 text-sm bg-gray-100 border border-gray-200 rounded-full outline-none focus:border-gray-400 focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={handleClear}
                    className="absolute right-8 p-0.5 hover:bg-gray-200 rounded-full transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="absolute right-2 p-0.5 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="search-button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSearchOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Search className="w-5 h-5 text-gray-600" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
