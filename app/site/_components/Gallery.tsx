'use client'
import { useEffect, useRef, useState } from 'react'

export type Clip = { label: string; caption: string; bg: string; fg: string }

/**
 * "Real nights" gallery. On desktop the section pins while scrolling down moves the
 * clips sideways (1px of scroll = 1px of track). On phones, or with reduced motion,
 * it's a normal swipeable row.
 */
export function Gallery({ clips, children }: { clips: Clip[]; children: React.ReactNode }) {
  const outer = useRef<HTMLElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [distance, setDistance] = useState(0) // 0 = not pinned

  useEffect(() => {
    const wide = matchMedia('(min-width: 768px)')
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0

    const measure = () => {
      const t = track.current, v = view.current
      if (!t || !v || !wide.matches || still.matches) { setDistance(0); if (t) t.style.transform = ''; return }
      setDistance(Math.max(0, t.scrollWidth - v.clientWidth))
    }
    const update = () => {
      frame = 0
      const o = outer.current, t = track.current
      if (!o || !t || !wide.matches || still.matches) return
      const r = o.getBoundingClientRect()
      const run = r.height - innerHeight
      const p = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 0
      t.style.transform = `translate3d(${(-p * (t.scrollWidth - (view.current?.clientWidth ?? 0))).toFixed(1)}px, 0, 0)`
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }

    measure(); update()
    const ro = new ResizeObserver(() => { measure(); update() })
    if (track.current) ro.observe(track.current)
    addEventListener('scroll', onScroll, { passive: true })
    wide.addEventListener('change', measure)
    return () => { ro.disconnect(); removeEventListener('scroll', onScroll); wide.removeEventListener('change', measure); if (frame) cancelAnimationFrame(frame) }
  }, [])

  return (
    <section
      ref={outer}
      className={'real' + (distance ? ' is-pinned' : ' sec')}
      aria-labelledby="real-h"
      style={distance ? { height: `calc(100vh + ${distance}px)` } : undefined}
    >
      <div className="real-inner">
        {children}
        <div className="gallery-view" ref={view}>
          <div className="gtrack" ref={track}>
            {clips.map((c) => (
              <figure key={c.caption} className="clip">
                <div className="clip-media" role="img" aria-label="Video coming soon" style={{ background: c.bg, color: c.fg }}>{c.label}</div>
                <figcaption>{c.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
