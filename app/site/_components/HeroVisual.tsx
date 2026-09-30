'use client'
import { useEffect, useRef, useState } from 'react'
import { shuttleGeometry } from '@/lib/site/shuttle'
import { Icon } from './Icon'

const ROUND_SECS = 480
const RING = 339.3 // circumference of r=54

/**
 * The hero's right-hand side: the live-session phone, the feather shuttlecock and
 * the floating chips. The pointer tilts the phone, turns the shuttle and moves the
 * glow (all via transforms). Animation pauses off screen and for reduced motion.
 */
export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(0)
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 })
  const [secs, setSecs] = useState(402)

  useEffect(() => {
    const hero = ref.current?.closest<HTMLElement>('.hero')
    if (!hero) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches

    const timer = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : ROUND_SECS)), 1000)
    if (still) return () => clearInterval(timer)

    let frame = 0, visible = true, last = 0, pending: { x: number; y: number } | null = null
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (!visible || document.hidden || now - last < 33) return // ~30fps is plenty
      last = now
      setT(now / 1000)
      if (pending) { setPointer(pending); pending = null }
    }
    frame = requestAnimationFrame(tick)

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const r = hero.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
      hero.style.setProperty('--gx', `${e.clientX - r.left}px`)
      hero.style.setProperty('--gy', `${e.clientY - r.top}px`)
      hero.style.setProperty('--ry', `${((x - 0.5) * -16).toFixed(2)}deg`)
      hero.style.setProperty('--rx', `${((y - 0.5) * 9).toFixed(2)}deg`)
      pending = { x, y }
    }
    hero.addEventListener('pointermove', onMove)
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting })
    io.observe(hero)

    return () => { clearInterval(timer); cancelAnimationFrame(frame); hero.removeEventListener('pointermove', onMove); io.disconnect() }
  }, [])

  const sh = shuttleGeometry(t, pointer.x, pointer.y)
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`

  return (
    <div className="hero-vis" ref={ref}>
      <div className="phone" aria-hidden="true">
        <div className="screen">
          <span className="kicker" style={{ color: '#4A5A45' }}>Round 4</span>
          <span className="disp" style={{ fontSize: 'clamp(2.25rem, 3.6vw, 3.25rem)' }}>Court 3</span>
          <div className="ring">
            <svg viewBox="0 0 140 140" width="100%" height="100%">
              <defs>
                <linearGradient id="tss-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2E8B57" /><stop offset="1" stopColor="#B7E35A" /></linearGradient>
              </defs>
              <circle cx="70" cy="70" r="54" fill="none" stroke="#0F2A1A" strokeOpacity="0.1" strokeWidth="10" />
              <circle cx="70" cy="70" r="54" fill="none" stroke="url(#tss-ring)" strokeWidth="10" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - secs / ROUND_SECS)} transform="rotate(-90 70 70)" />
            </svg>
            <div className="ring-label">
              <span className="num" style={{ fontSize: 'clamp(1.75rem, 2.8vw, 2.5rem)' }}>{clock}</span>
              <span className="kicker" style={{ color: '#4A5A45' }}>Left in round</span>
            </div>
          </div>
        </div>
      </div>

      <svg className="shuttle" viewBox="0 0 400 470" role="img" aria-label="A green feather shuttlecock">
        <defs>
          <radialGradient id="tss-cork" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.6" stopColor="#EDEBE3" /><stop offset="1" stopColor="#B9B4A4" /></radialGradient>
          <linearGradient id="tss-band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1F6B3E" /><stop offset="0.45" stopColor="#3FA66A" /><stop offset="1" stopColor="#17512F" /></linearGradient>
        </defs>
        <g transform={sh.tilt}>
          {sh.back.map((f, k) => (
            <g key={'b' + k}>
              <path d={f.d} fill={f.fill} fillOpacity="0.95" stroke="#0B2A16" strokeOpacity="0.35" strokeWidth="0.7" />
              <path d={f.barbs + f.barbsDark} fill="none" stroke="#082012" strokeOpacity="0.22" strokeWidth="0.55" />
              <path d={f.shaft} fill="none" stroke="#EDEBDD" strokeOpacity="0.55" strokeWidth="1.5" />
            </g>
          ))}
          <path d={sh.ringBack} fill="none" stroke="#EDEBDD" strokeOpacity="0.7" strokeWidth="2.2" />
          {sh.front.map((f, k) => (
            <g key={'f' + k}>
              <path d={f.d} fill={f.fill} fillOpacity="0.96" stroke="#0B2A16" strokeOpacity="0.3" strokeWidth="0.7" />
              <path d={f.barbs} fill="none" stroke="#FFFFFF" strokeOpacity="0.32" strokeWidth="0.55" />
              <path d={f.barbsDark} fill="none" stroke="#0B2A16" strokeOpacity="0.14" strokeWidth="0.5" />
              <path d={f.shaft} fill="none" stroke="#FBFAF3" strokeWidth="2" />
            </g>
          ))}
          <path d={sh.ringFront} fill="none" stroke="#F4F2E6" strokeWidth="3" />
          <path d={sh.ringFrontShade} fill="none" stroke="#0B2A16" strokeOpacity="0.25" strokeWidth="1" />
          <path d={sh.cork} fill="url(#tss-cork)" stroke="#8C8778" strokeOpacity="0.5" />
          <path d={sh.band} fill="url(#tss-band)" />
          <ellipse cx="200" cy={sh.baseY} rx={sh.corkRx} ry={sh.corkRy} fill="#174F2E" />
        </g>
      </svg>

      <div className="chip chip-a" aria-hidden="true"><span><Icon name="check" size={13} /></span>Checked in</div>
      <div className="chip chip-b" aria-hidden="true">Next up · <strong>new partner</strong></div>
      <div className="chip chip-c" aria-hidden="true">Grand final at the end of the night</div>
    </div>
  )
}
