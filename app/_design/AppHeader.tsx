import { ThemeToggle } from './ThemeToggle'

function Arrow() {
  return (
    <span className="book-arrow" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9F46B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  )
}

/** Compact green header: name (to the website), My portal, and the theme switch. */
export function AppHeader() {
  return (
    <div className="a-head">
      <header className="nav">
        <a href="https://theshuttlesocial.com" className="brand" aria-label="The Shuttle Social home">the shuttle social</a>
        <div className="nav-right">
          <a href="/account" className="book small">My portal<Arrow /></a>
          <ThemeToggle app />
        </div>
      </header>
    </div>
  )
}
