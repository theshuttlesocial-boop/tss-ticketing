import type { Metadata } from 'next'
import { getPublicSessions, type PublicSession } from '@/lib/sessions/public'
import { BOOK, INSTAGRAM } from '@/lib/site/links'
import { Arrow, PageHero, SiteFooter } from '../_components/SiteChrome'

// Availability refreshes every minute.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Sessions',
  description: 'Upcoming social badminton sessions in London: dates, venues, prices and live availability. £10, all levels, no membership.',
  alternates: { canonical: '/sessions' },
}

function status(s: PublicSession) {
  if (s.status === 'coming_soon') {
    const opens = s.opens_at ? new Date(s.opens_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null
    return { tag: 'Coming soon', cta: opens ? `Tickets open ${opens}` : 'Tickets open soon' }
  }
  if (s.availability === 'sold_out') return { tag: 'Full', cta: 'Join the waitlist →' }
  if (s.availability === 'limited') return { tag: `${s.spotsRemaining} left`, cta: 'Book now →' }
  return { tag: 'Spaces available', cta: 'Book now →' }
}

const NIGHT = [
  ['Arrive and check in', 'Show the QR code from your booking email or My portal at the door.'],
  ['Get your court', 'Your phone shows your court and the round timer.'],
  ['Timed rounds of doubles', 'A new partner every round. Scores go in on your phone.'],
  ['Grand final', 'The night finishes with a grand final.'],
]

export default async function SessionsPage() {
  const pub = await getPublicSessions()
  const sessions = 'sessions' in pub ? pub.sessions : []

  return (
    <>
      <PageHero current="/sessions" kicker="Sessions" title="Find your next night on court."
        lead="Every session is ticket-only and spaces go fast. £10, all levels, no membership.">
        <a href={BOOK} className="book book-lg">Book a session<Arrow /></a>
      </PageHero>

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="up-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h2 id="up-h" className="disp h2">Coming up</h2>
                <span className="live small"><span className="dot" />Live from bookings</span>
              </div>
            </div>
            {sessions.length ? (
              <div className="days" data-reveal-stagger="">
                {sessions.map((s, k) => {
                  const d = new Date(s.date + 'T12:00:00Z')
                  const [venue, postcode] = String(s.venue).split(/,\s*(?=[A-Z]{1,2}\d)/)
                  const st = status(s)
                  return (
                    <a key={s.id} href={BOOK} className={'day' + (k === 0 ? ' day-first' : '')} data-reveal="">
                      <div className="day-top">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <span className="kicker" style={{ opacity: 0.75 }}>{d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/London' })}</span>
                          <span className="disp day-date">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}</span>
                        </div>
                        <span className="tag">{st.tag}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <span className="h3">{s.title}</span>
                        <span className="small" style={{ opacity: 0.8 }}>{s.time} · {venue}{postcode ? `, ${postcode}` : ''}</span>
                        <span className="small" style={{ opacity: 0.75 }}>£{(s.price_pence / 100).toFixed(s.price_pence % 100 ? 2 : 0)} · all levels</span>
                      </div>
                      <span className="day-cta">{st.cta}</span>
                    </a>
                  )
                })}
              </div>
            ) : (
              <p className="empty lead" data-reveal="">No sessions are on sale right now. New dates are announced on WhatsApp and Instagram first. <a href={INSTAGRAM}>Follow @theshuttlesocial</a>.</p>
            )}
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-how)' }} aria-labelledby="night-h">
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 id="night-h" className="disp h2">What a night looks like</h2>
              <p className="lead muted">Come on your own or bring friends. Everyone plays with everyone.</p>
            </div>
            <ol className="timeline" data-reveal-stagger="">
              {NIGHT.map(([t, b]) => <li key={t} data-reveal=""><div><strong>{t}</strong><span className="muted">{b}</span></div></li>)}
            </ol>
          </div>
        </section>

        <section className="sec faq-sec" aria-labelledby="tix-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="tix-h" className="disp h2" style={{ color: 'var(--lime)' }}>How tickets work</h2>
            </div>
            <div className="cards" data-reveal-stagger="">
              <div className="card card-deep" data-reveal="">
                <span className="icon" aria-hidden="true">📣</span>
                <h3 className="h3">Released on WhatsApp</h3>
                <p>New sessions are shared in our WhatsApp community and on Instagram first. Our fastest sell-out took 30 seconds.</p>
              </div>
              <div className="card card-deep" data-reveal="">
                <span className="icon" aria-hidden="true">⏳</span>
                <h3 className="h3">Sold out? Join the waitlist</h3>
                <p>If a space opens up, the next person on the waitlist gets an email and a short time to claim it.</p>
              </div>
              <div className="card card-deep" data-reveal="">
                <span className="icon" aria-hidden="true">🔁</span>
                <h3 className="h3">Can’t make it?</h3>
                <p>Release your space from My portal. When someone takes it, you get credit or a refund. <a href="/terms" style={{ color: 'var(--lime)' }}>Terms</a></p>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-real)' }} aria-labelledby="where-h">
          <div className="wrap split">
            <h2 id="where-h" className="disp h2" data-reveal="">Where we play</h2>
            <div className="prose lead" data-reveal="">
              <p>Our sessions are currently mainly in West London. We’ll be starting up again in East and South London.</p>
              <p className="muted small">The venue and address for each session are on its ticket and in your booking email.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
