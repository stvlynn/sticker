import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lynn-chan Stickers',
  description: 'A collection of Lynn Chan stickers and memes',
  openGraph: {
    title: 'Lynn-chan Stickers',
    description: 'A collection of Lynn Chan stickers and memes',
    url: 'https://lynn-chan-stickers.vercel.app',
    siteName: 'Stickers by Steve Lynn',
    images: [
      {
        url: '/ogimage.png',
        width: 1200,
        height: 630,
        alt: 'Stickers by Steve Lynn',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lynn-chan Stickers',
    description: 'A collection of Lynn Chan stickers and memes',
    images: ['/ogimage.png'],
  },
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
