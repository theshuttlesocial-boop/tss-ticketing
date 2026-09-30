import { urbanist } from './font'
import { ThemeToggle, themeScript } from './ThemeToggle'
import './tss.css'
import './app.css'

function Arrow() {
  return (
    <span className="book-arrow" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9F46B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  )
}

/**
 * Layout for player pages (My portal, release, claim, transfer, leaderboard, privacy,
 * ratings): V5 design system, dark mode, and a compact green header.
 * Use as a route's layout: `export { default } from '@/app/_design/AppFrame'`.
 */
export default function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`tss ${urbanist.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <a className="skip" href="#main-content">Skip to main content</a>
      <div className="a-head">
        <header className="nav">
          <a href="/tickets" className="brand">the shuttle social</a>
          <div className="nav-right">
            <a href="/account" className="book small">My portal<Arrow /></a>
            <ThemeToggle />
          </div>
        </header>
      </div>
      <div id="main-content">{children}</div>
    </div>
  )
}
