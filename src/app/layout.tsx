import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lynn-chan Stickers',
  description: 'A collection of Lynn Chan stickers and memes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background antialiased">
        {children}
      </body>
    </html>
  )
}
