'use client'
import { useEffect, useRef } from 'react'

/**
 * The lime glow in a page banner follows the pointer (as on the homepage hero) and the
 * floating chips lean slightly towards it. Transforms only; nothing on touch or reduced motion.
 */
export function HeroGlow() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hero = ref.current?.closest<HTMLElement>('.hero')
    if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0, e: PointerEvent | null = null
    const apply = () => {
      frame = 0
      if (!e) return
      const r = hero.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      hero.style.setProperty('--gx', `${x}px`)
      hero.style.setProperty('--gy', `${y}px`)
      hero.style.setProperty('--px', ((x / r.width - 0.5) * 2).toFixed(3))
      hero.style.setProperty('--py', ((y / r.height - 0.5) * 2).toFixed(3))
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch') return
      e = ev
      if (!frame) frame = requestAnimationFrame(apply)
    }
    hero.addEventListener('pointermove', onMove)
    return () => { hero.removeEventListener('pointermove', onMove); if (frame) cancelAnimationFrame(frame) }
  }, [])

  return <div ref={ref} className="hero-glow" aria-hidden="true" />
}
