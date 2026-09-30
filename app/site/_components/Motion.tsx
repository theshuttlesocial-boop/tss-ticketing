'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const STAGGER_MS = 80

/**
 * The site's one motion utility, mounted once in the layout.
 *  - [data-reveal] fades up once when it enters the viewport, then is left alone.
 *  - [data-reveal-stagger] staggers its revealed descendants 80ms apart.
 *  - [data-parallax="0.3"] drifts decorative elements at a fraction of scroll speed
 *    (desktop only, transform only, one rAF per frame).
 *  - .card gets a soft light that follows the pointer.
 * Reduced motion: everything is shown at once and nothing drifts.
 */
export function Motion() {
  const pathname = usePathname()

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.tss')
    if (!root) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const show = (el: Element) => el.setAttribute('data-shown', '')
    const items = [...root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-shown])')]

    if (still || !('IntersectionObserver' in window)) { items.forEach(show); return }

    // Delay only the reveal (opacity, translate); hover transitions stay instant.
    root.querySelectorAll('[data-reveal-stagger]').forEach((parent) => {
      parent.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el, k) => {
        const d = Math.min(k, 8) * STAGGER_MS
        if (d) el.style.transitionDelay = `${d}ms, ${d}ms, 0s, 0s, 0s, 0s`
      })
    })

    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue
        show(en.target)
        io.unobserve(en.target)
        // Once it's in, drop the stagger so later hovers aren't delayed.
        setTimeout(() => { (en.target as HTMLElement).style.transitionDelay = '' }, 1600)
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' })
    items.forEach((el) => io.observe(el))

    // Parallax on decorative elements, desktop only.
    const decor = [...root.querySelectorAll<HTMLElement>('[data-parallax]')]
    let frame = 0
    const update = () => {
      frame = 0
      if (innerWidth < 768) return
      for (const el of decor) {
        const r = (el.parentElement ?? el).getBoundingClientRect()
        if (r.bottom < -200 || r.top > innerHeight + 200) continue
        const offset = (r.top + r.height / 2 - innerHeight / 2) * Number(el.dataset.parallax || 0.4)
        el.style.transform = `translate3d(0, ${(-offset).toFixed(1)}px, 0)`
      }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    if (decor.length) { update(); addEventListener('scroll', onScroll, { passive: true }) }

    // Cards: a soft light follows the pointer (CSS reads --cx/--cy). Mouse and pen only.
    const onCard = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const card = (e.target as Element).closest?.<HTMLElement>('.card')
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--cx', `${e.clientX - r.left}px`)
      card.style.setProperty('--cy', `${e.clientY - r.top}px`)
    }
    root.addEventListener('pointermove', onCard, { passive: true })

    return () => { io.disconnect(); removeEventListener('scroll', onScroll); root.removeEventListener('pointermove', onCard); if (frame) cancelAnimationFrame(frame) }
  }, [pathname])

  return null
}
