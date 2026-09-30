'use client'
import { useEffect, useRef } from 'react'

/**
 * Paragraphs whose words light up one by one as they scroll through the screen.
 * The server renders plain, fully visible text (no JS, search engines, screen readers);
 * the effect only dims words that haven't been reached yet. Off for reduced motion.
 */
export function ScrollText({ paragraphs, className }: { paragraphs: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  let i = 0
  const total = paragraphs.reduce((n, p) => n + p.split(' ').length, 0)

  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.dataset.live = ''
    let frame = 0
    const update = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      // 0 when the block's top reaches 85% down the screen, 1 when its bottom reaches 45%.
      const start = innerHeight * 0.85, end = innerHeight * 0.45
      const p = Math.min(1, Math.max(0, (start - r.top) / (start - end + r.height)))
      el.style.setProperty('--p', p.toFixed(3))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [])

  return (
    <div ref={ref} className={`scroll-text ${className ?? ''}`} style={{ ['--n' as string]: total }}>
      {paragraphs.map((p, k) => (
        <p key={k}>
          {p.split(' ').map((w, j) => <span key={j} style={{ ['--i' as string]: i++ }}>{w} </span>)}
        </p>
      ))}
    </div>
  )
}
