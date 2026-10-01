'use client'
import { useEffect, useRef, useState } from 'react'

/** A clip from the nights: a muted, looping MP4 (self-hosted, no tracking embeds) and its cover image. */
export type Clip = { src: string; poster: string; caption: string; alt: string }

/**
 * Plays only while on screen (and doesn't download until it's near), so the page stays
 * light. With reduced motion it never autoplays: the cover shows, with controls to play.
 */
function ClipVideo({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [still, setStill] = useState(false)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setStill(true); return }
    let inView = false
    const play = () => { if (inView && document.visibilityState === 'visible') v.play().catch(() => {}) }
    const io = new IntersectionObserver(([en]) => {
      inView = en.isIntersecting
      if (inView) { v.preload = 'auto'; play() } else v.pause()
    }, { rootMargin: '200px 0px', threshold: 0.25 })
    io.observe(v)
    // A play blocked while the tab was hidden starts once it's visible again.
    document.addEventListener('visibilitychange', play)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', play) }
  }, [])

  return (
    <video ref={ref} src={clip.src} poster={clip.poster} muted loop playsInline preload="none"
      controls={still} aria-label={clip.alt} />
  )
}

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
                <div className="clip-media"><ClipVideo clip={c} /></div>
                <figcaption>{c.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
