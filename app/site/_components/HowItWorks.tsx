'use client'
import { useEffect, useRef, useState } from 'react'

export type Step = { title: string; body: string; kicker: string; big: string; small: string }

/**
 * Heading and phone-card visual pin (CSS sticky) while the three steps scroll past;
 * the card shows whichever step is in the middle of the screen.
 */
export function HowItWorks({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState(0)
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const items = list.current?.querySelectorAll<HTMLElement>('[data-step]')
    if (!items?.length || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) setActive(Number((en.target as HTMLElement).dataset.step))
    }, { rootMargin: '-45% 0px -45% 0px' })
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const s = steps[active]
  return (
    <div className="wrap how">
      <div className="how-pin" data-reveal="">
        <h2 id="how-h" className="disp h2">How a night works</h2>
        <div className="how-vis" aria-hidden="true">
          <span className="decor how-glow" />
          <div className="how-card" key={active}>
            <span className="kicker" style={{ color: '#4A5A45' }}>{s.kicker}</span>
            <span className="disp" style={{ fontSize: 'clamp(1.75rem, 2.6vw, 2.25rem)' }}>{s.big}</span>
            <span className="small" style={{ color: '#3B4A37' }}>{s.small}</span>
          </div>
        </div>
      </div>
      <ol className="steps" ref={list}>
        {steps.map((st, k) => (
          <li key={st.title} className="step" data-step={k} data-active={k === active}>
            <span className="step-n">{String(k + 1).padStart(2, '0')}</span>
            <h3>{st.title}</h3>
            <p className="lead muted" style={{ maxWidth: '40ch' }}>{st.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
