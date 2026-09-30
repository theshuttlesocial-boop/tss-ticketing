import type { ReactNode } from 'react'
import { ThemeToggle } from '@/app/_design/ThemeToggle'
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

/** Green banner at the top of every page other than the homepage. */
export function PageHero({ current, kicker, title, lead, children }: {
  current: string; kicker: string; title: ReactNode; lead?: ReactNode; children?: ReactNode
}) {
  return (
    <div className="hero page-hero">
      <div className="hero-glow" aria-hidden="true" />
      <SiteNav current={current} />
      <div className="wrap page-hero-body">
        <span className="kicker" style={{ color: 'var(--lime)' }}>{kicker}</span>
        <h1 className="disp h1">{title}</h1>
        {lead && <p className="lead" style={{ maxWidth: '40ch', color: 'var(--on-dark-2)' }}>{lead}</p>}
        {children && <div className="hero-actions">{children}</div>}
      </div>
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
          <a href="/volunteer">Volunteer</a>
          <a href="/contact">Contact</a>
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
