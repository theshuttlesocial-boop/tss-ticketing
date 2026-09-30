import type { CSSProperties, ReactNode } from 'react'
import { ThemeToggle } from '@/app/_design/ThemeToggle'
import { HeroGlow } from './HeroGlow'
import { BOOK, EMAIL, INSTAGRAM, NAV, TIKTOK } from '@/lib/site/links'

export function Arrow() {
  return (
    <span className="book-arrow" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9F46B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  )
}

/**
 * Site header: name, page links, theme switch and Book. On phones the links move into
 * a menu (a native <details>, so it works before JavaScript loads).
 */
export function SiteNav({ current }: { current?: string }) {
  const links = NAV.map(([href, label]) => (
    <a key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</a>
  ))
  return (
    <header className="nav">
      <a href="/" className="brand">the shuttle social</a>
      <nav aria-label="Main" className="nav-links">{links}</nav>
      <div className="nav-right">
        <ThemeToggle />
        <details className="menu">
          <summary aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4F7EC" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </summary>
          <nav aria-label="Main" className="menu-panel">
            <a href="/">Home</a>
            {links}
          </nav>
        </details>
        <a href={BOOK} className="book small"><span className="book-long">Book a session</span><span className="book-short">Book</span><Arrow /></a>
      </div>
    </header>
  )
}

// Chip and strip colours from the V5 palette (never white).
const PAL = [
  { background: 'linear-gradient(150deg, #F0FF9A 0%, #D9F46B 55%, #BDEA5A 100%)', color: '#0F2A1A', nc: '#0F2A1A' },
  { background: 'linear-gradient(150deg, #D6F2E0 0%, #A6E0BF 100%)', color: '#0F2A1A', nc: '#1E6B3E' },
  { background: '#0F2A1A', color: '#F4F7EC', nc: '#D9F46B' },
  { background: 'linear-gradient(150deg, #B4ECDC 0%, #72CBAE 100%)', color: '#0F2A1A', nc: '#0F2A1A' },
  { background: 'linear-gradient(150deg, #EAF5C8 0%, #D2E89A 100%)', color: '#0F2A1A', nc: '#1E6B3E' },
  { background: 'linear-gradient(150deg, #3FA66A 0%, #1E6B3E 100%)', color: '#F4F7EC', nc: '#D9F46B' },
]
const ROT = [-2, 1.5, -1, 2, -1.5, 1]

/** Sliding strip of colourful chips (pauses on hover; a still list for reduced motion). */
export function Marquee({ items, label }: { items: [n: string, t: string][]; label: string }) {
  return (
    <div className="strip" role="region" aria-label={label}>
      <div className="strip-track">
        {[false, true].map((copy) => (
          <ul key={String(copy)} className="strip-set" aria-hidden={copy || undefined}>
            {items.map(([n, t], k) => {
              const c = PAL[k % PAL.length]
              return (
                <li key={t}>
                  <span className="mchip" style={{ background: c.background, color: c.color, ['--rot' as string]: `${ROT[k % ROT.length]}deg` } as CSSProperties}>
                    <span className="num" style={{ color: c.nc }}>{n}</span><span className="mt">{t}</span>
                  </span>
                  <svg className="msep" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4l4.2 11.8L36 20l-11.8 4.2L20 36l-4.2-11.8L4 20l11.8-4.2z" fill="#D9F46B" /></svg>
                </li>
              )
            })}
          </ul>
        ))}
      </div>
    </div>
  )
}

/**
 * Green banner at the top of every page other than the homepage, with the homepage's
 * moving parts: the glow follows the pointer, chips float and lean, shapes drift, and a
 * strip of chips slides along the bottom. `srTitle` is the full heading for screen readers
 * when the visible title has a rotating word.
 */
export function PageHero({ current, kicker, title, srTitle, lead, chips = [], strip, children }: {
  current: string; kicker: string; title: ReactNode; srTitle?: string; lead?: ReactNode
  chips?: ReactNode[]; strip?: { label: string; items: [string, string][] }; children?: ReactNode
}) {
  return (
    <div className="hero page-hero">
      <HeroGlow />
      <span className="decor decor-lime ph-orb" data-parallax="0.35" aria-hidden="true" />
      <span className="ph-ring" aria-hidden="true" />
      <SiteNav current={current} />
      <div className="wrap page-hero-body">
        <div className="page-hero-copy">
          <span className="kicker" style={{ color: 'var(--lime)' }}>{kicker}</span>
          <h1 className="disp h1">
            {srTitle ? <><span className="sr-only">{srTitle}</span><span aria-hidden="true">{title}</span></> : title}
          </h1>
          {lead && <p className="lead" style={{ maxWidth: '40ch', color: 'var(--on-dark-2)' }}>{lead}</p>}
          {children && <div className="hero-actions">{children}</div>}
        </div>
        {chips.length > 0 && (
          <div className="ph-chips" aria-hidden="true">
            {chips.map((c, k) => <div key={k} className={`chip ph-chip ph-chip-${k}`}>{c}</div>)}
          </div>
        )}
      </div>
      {strip && <Marquee label={strip.label} items={strip.items} />}
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="wrap foot">
      <div className="foot-cols">
        <div className="foot-brand">
          <a href="/" className="brand">the shuttle social</a>
          <span>Social badminton in London.</span>
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
        </div>
        <nav aria-label="Pages" className="foot-list">
          <a href="/sessions">Sessions</a>
          <a href="/about">About</a>
          <a href="/community">Community</a>
          <a href="/join-us">Join us</a>
          <a href="/contact">Contact</a>
          <a href="/community#suggestions">Suggestions</a>
          <a href="/#faqs">FAQs</a>
        </nav>
        <nav aria-label="Players" className="foot-list">
          <a href={BOOK}>Book a session</a>
          <a href="/account">My portal</a>
          <a href="/release">Release your spot</a>
          <a href="/leaderboard">Leaderboard</a>
        </nav>
        <nav aria-label="Legal and social" className="foot-list">
          <a href={INSTAGRAM}>Instagram</a>
          <a href={TIKTOK}>TikTok</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </nav>
      </div>
      <p className="foot-note">© {new Date().getFullYear()} The Shuttle Social · No tracking cookies</p>
    </footer>
  )
}

/** Marks words the club still needs to supply, so they're easy to spot before launch. */
export function Ph({ children }: { children: ReactNode }) {
  return <span className="ph">[{children}]</span>
}
