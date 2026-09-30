'use client'
import { useEffect, useRef, useState } from 'react'

const DURATION = 1200
const fmt = (n: number) => n.toLocaleString('en-GB')

/**
 * A stat number that counts up from zero, with ease-out, when it scrolls into view.
 * The server renders the final value (no JS, search engines, reduced motion all see it),
 * and screen readers only ever get the final value.
 */
export function CountUp({ to, prefix = '', suffix = '', className }: { to: number; prefix?: string; suffix?: string; className?: string }) {
  const [n, setN] = useState(to)
  const el = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = el.current
    if (!node || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const r = node.getBoundingClientRect()
    if (r.top < innerHeight && r.bottom > 0) return // already on screen at load: don't replay
    setN(0)
    let frame = 0
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / DURATION)
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
        if (p < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }, { threshold: 0.4 })
    io.observe(node)
    return () => { io.disconnect(); cancelAnimationFrame(frame) }
  }, [to])

  return (
    <span className={className} ref={el}>
      <span aria-hidden="true">{prefix}{fmt(n)}{suffix}</span>
      <span className="sr-only">{prefix}{fmt(to)}{suffix}</span>
    </span>
  )
}
