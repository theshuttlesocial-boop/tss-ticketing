import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Booking · The Shuttle Social', robots: { index: false } }

type Params = { ref?: string; redirect_status?: string }

/**
 * Where Stripe returns people after a payment that needed a redirect (e.g. a bank check).
 * The booking itself is confirmed by the Stripe webhook; this page only reports what
 * Stripe told the browser and points to the confirmation email.
 */
export default async function BookingResult({ searchParams }: { searchParams: Promise<Params> }) {
  const { ref, redirect_status: status } = await searchParams
  const failed = status === 'failed'
  const pending = status === 'processing'
  const safeRef = ref && /^[A-Z0-9-]{4,20}$/i.test(ref) ? ref : null

  return (
    <main id="main-content" className="t-overlay" style={{ position: 'static', minHeight: '100vh', background: 'var(--page)' }}>
      <div className="t-modal t-done" role="status">
        <div className="t-done-mark" aria-hidden="true" style={failed ? { background: 'var(--danger-dim)', color: 'var(--danger)' } : undefined}>{failed ? '!' : pending ? '…' : '✓'}</div>
        <h1 className="t-modal-title">{failed ? 'Payment didn’t go through' : pending ? 'Payment processing' : 'You’re in!'}</h1>
        <p className="muted small">
          {failed
            ? 'No money has been taken. Head back to the sessions and try again.'
            : pending
              ? 'Your bank is still confirming the payment. We’ll email you as soon as it’s done.'
              : 'Your confirmation email is on its way. It has your ticket and QR code.'}
        </p>
        {safeRef && <p className="muted small">Booking ref <strong style={{ color: 'var(--accent)' }}>{safeRef}</strong></p>}
        <a href="/tickets" className={failed ? 'book' : 't-btn t-btn-ink'}>
          {failed ? 'Back to sessions' : 'Done'}
          {failed && <span className="book-arrow" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9F46B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>}
        </a>
      </div>
    </main>
  )
}
