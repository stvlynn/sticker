import { Github } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-background py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left: License and Copyright */}
          <div className="text-xs text-gray-500 font-mono space-y-1">
            <p>CC BY 4.0 • Non-commercial use only</p>
            <p>© 2025 Steven Lynn. All rights reserved.</p>
          </div>

          {/* Right: GitHub Link */}
          <a
            href="https://github.com/stvlynn/lynn-chan"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-foreground transition-colors font-mono"
          >
            <Github className="w-4 h-4" />
            <span>github.com/stvlynn/lynn-chan</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
