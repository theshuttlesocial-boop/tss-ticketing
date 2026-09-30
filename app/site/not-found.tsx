export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main id="main" className="sec cta-sec" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <div className="wrap cta" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <span className="kicker" style={{ color: 'var(--lime)' }}>404 · Out of court</span>
        <h1 className="disp h1">That shot went long.</h1>
        <p className="lead" style={{ color: 'var(--on-dark-2)', maxWidth: '34ch' }}>We couldn’t find that page. Head back to the homepage or book a session.</p>
        <div className="hero-actions">
          <a href="/" className="pill pill-cream">Homepage</a>
          <a href="/tickets" className="book">Book a session<span className="book-arrow" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9F46B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span></a>
        </div>
      </div>
    </main>
  )
}
