import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#f4f4f4',
        foreground: '#1a1a1a',
      },
      fontFamily: {
        heading: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        body: ['MiSans VF', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'sticker': '0 4px 14px rgba(0, 0, 0, 0.1)',
        'sticker-hover': '0 12px 28px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
}

export default config
