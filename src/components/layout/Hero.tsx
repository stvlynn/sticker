import { useState } from 'react'
import { Send, MessageCircle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

export function Hero() {
  const [showQR, setShowQR] = useState(false)

  return (
    <section className="py-12 md:py-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Big headline */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-heading font-black tracking-tight text-foreground">
          Lynn-chan Stickers
        </h1>

        {/* Intro copy */}
        <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl">
          Did you go to work today? 今天你返工了吗？
        </p>

        {/* Font credits and badges */}
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-400">
            Font uses{' '}
            <a
              href="https://fonts.google.com/specimen/Bricolage+Grotesque"
              className="underline hover:text-gray-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              Bricolage Grotesque
            </a>{' '}
            and{' '}
            <a
              href="https://hyperos.mi.com/font/zh/"
              className="underline hover:text-gray-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              MiSans VF
            </a>
            . Sticker copyrights belong to Steven Lynn.
          </p>

          {/* Platform badges */}
          <div className="flex gap-2">
            <a
              href="https://t.me/addstickers/lynnchan"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Use on Telegram
            </a>
            <div className="relative">
              <button
                onClick={() => setShowQR(!showQR)}
                onMouseEnter={() => setShowQR(true)}
                onMouseLeave={() => setShowQR(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 border border-green-200 rounded-full text-xs font-medium hover:bg-green-100 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Use on WeChat
              </button>

              <AnimatePresence>
                {showQR && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50"
                  >
                    <div className="relative w-32 h-32">
                      <Image
                        src="/qr1.bmp"
                        alt="WeChat QR Code"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
