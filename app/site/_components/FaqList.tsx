'use client'
import { useId, useState } from 'react'

/**
 * Numbered FAQ accordion. Real buttons with aria-expanded/aria-controls; the answer's
 * height animates open (grid 0fr → 1fr), the item lifts, and the text fades in just after.
 * Answers stay in the page when closed, so they're still searchable and indexable.
 */
export function FaqList({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(0)
  const base = useId()

  return (
    <ol className="faq-list" data-reveal-stagger="">
      {items.map(([q, a], k) => {
        const isOpen = open === k
        const btn = `${base}-q${k}`, panel = `${base}-a${k}`
        return (
          <li key={q} className="faq-item" data-reveal="" data-open={isOpen}>
            <h3 className="faq-h">
              <button type="button" id={btn} className="faq-btn" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? null : k)}>
                <span className="num" aria-hidden="true">{String(k + 1).padStart(2, '0')}</span>
                <span className="faq-q">{q}</span>
                <span className="faq-icon" aria-hidden="true">+</span>
              </button>
            </h3>
            <div className="faq-panel" id={panel} role="region" aria-labelledby={btn} inert={!isOpen}>
              <div><p className="faq-a">{a}</p></div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
