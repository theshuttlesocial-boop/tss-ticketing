import type { Metadata } from 'next'
import { getPublicSessions } from '@/lib/sessions/public'
import { getWelcomeSettings } from '@/lib/welcome'
import { BOOK } from '@/lib/site/links'
import { FAQS } from '@/lib/site/faqs'
import { FaqList } from '../_components/FaqList'
import { Icon, type IconName } from '../_components/Icon'
import { RotatingWord } from '../_components/RotatingWord'
import { Arrow, PageHero, SiteFooter } from '../_components/SiteChrome'

// Live sessions and the current offer; the ?src= tag changes per link, so render per request.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Welcome',
  description: 'New to The Shuttle Social? Money off your first social badminton session in London, all levels, come on your own.',
  alternates: { canonical: '/welcome' },
  robots: { index: false, follow: true },   // a landing page for Instagram and WhatsApp links, not for search
}

const fmt = (p: number) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const [{ src: rawSrc }, w, pub] = await Promise.all([searchParams, getWelcomeSettings(), getPublicSessions()])
  const src = String(rawSrc ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30)
  const offer = w.enabled && w.discountPence > 0
  const bookUrl = offer ? `${BOOK}?code=${encodeURIComponent(w.code)}${src ? `&src=${src}` : ''}` : BOOK
  const sessions = ('sessions' in pub ? pub.sessions : []).filter((s) => s.status === 'open').slice(0, 3)
  const price = sessions[0]?.price_pence ?? 1000

  const steps: [IconName, string, string][] = [
    ['ticket', 'Tap “Book your first session”', offer ? `Your code ${w.code} is saved for you, nothing to type.` : 'It opens our tickets page.'],
    ['calendar', 'Pick a session and pay', offer ? `Your first session is ${fmt(price - w.discountPence)} instead of ${fmt(price)}.` : `${fmt(price)} a session, no membership.`],
    ['check', 'Show up and play', 'Your booking email has everything. Come on your own: you’ll play with someone new every round.'],
  ]

  return (
    <>
      <PageHero current="/welcome" kicker="Welcome"
        srTitle="Your first night on court."
        title={<>Your first night <RotatingWord words={['on court.', 'with us.', 'of doubles.']} /></>}
        lead={offer
          ? `${fmt(w.discountPence)} off your first session. All levels, come on your own, and play with someone new every round.`
          : 'All levels, come on your own, and play with someone new every round.'}
        chips={[<><Icon name="users" size={18} />Come on your own</>, <>All <strong>levels</strong></>, <><Icon name="shuttle" size={18} />New partner every round</>]}>
        <a href={bookUrl} className="book book-lg">Book your first session<Arrow /></a>
      </PageHero>

      <main id="main">
        {offer && (
          <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="code-h">
            <div className="wrap">
              <div className="card c-lime static welcome-code" data-reveal="">
                <span className="kicker">Your welcome code</span>
                <h2 id="code-h" className="num welcome-code-n">{w.code}</h2>
                <p className="lead">{fmt(w.discountPence)} off your first booking. It’s added for you when you use the button, and works once per person.</p>
                <a href={bookUrl} className="book">Book your first session<Arrow /></a>
              </div>
            </div>
          </section>
        )}

        <section className="sec" style={{ background: 'var(--s-how)' }} aria-labelledby="steps-h">
          <div className="wrap">
            <div className="head-row" data-reveal=""><h2 id="steps-h" className="disp h2">How booking works</h2></div>
            <div className="cards" data-reveal-stagger="">
              {steps.map(([icon, t, b], k) => (
                <div key={t} className={`card ${['c-mint', 'c-teal', 'c-sage'][k]}`} data-reveal="">
                  <span className="icon"><Icon name={icon} /></span>
                  <h3 className="h3" style={{ fontWeight: 800 }}>{t}</h3>
                  <p className="muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="next-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h2 id="next-h" className="disp h2">Coming up</h2>
                <span className="live small"><span className="dot" />Live from bookings</span>
              </div>
            </div>
            {sessions.length ? (
              <div className="days" data-reveal-stagger="">
                {sessions.map((s, k) => {
                  const d = new Date(s.date + 'T12:00:00Z')
                  const [venue, postcode] = String(s.venue).split(/,\s*(?=[A-Z]{1,2}\d)/)
                  const full = s.availability === 'sold_out'
                  return (
                    <a key={s.id} href={bookUrl} className={'day' + (k === 0 ? ' day-first' : '')} data-reveal="">
                      <div className="day-top">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <span className="kicker" style={{ opacity: 0.75 }}>{d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/London' })}</span>
                          <span className="disp day-date">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}</span>
                        </div>
                        <span className="tag">{full ? 'Full' : s.availability === 'limited' ? `${s.spotsRemaining} left` : 'Spaces available'}</span>
                      </div>
                      <span className="h3">{s.time} · {venue}{postcode ? `, ${postcode}` : ''}</span>
                      <span className="day-cta">{full ? 'Join the waitlist →' : 'Book now →'}</span>
                    </a>
                  )
                })}
              </div>
            ) : (
              <p className="empty lead" data-reveal="">New sessions are announced on WhatsApp and Instagram first. <a href="/join">Join our WhatsApp community</a> to hear about them.</p>
            )}
          </div>
        </section>

        <section className="sec faq-sec" aria-labelledby="faq-h">
          <div className="wrap faq">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem', alignItems: 'flex-start' }}>
              <h2 id="faq-h" className="disp h2 faq-title">FAQs</h2>
              <a href="/join" className="pill pill-cream small">Join our WhatsApp community</a>
            </div>
            <FaqList items={FAQS.filter(([q]) => q !== 'How do I join?')} />
          </div>
        </section>

        <section className="sec cta-sec" aria-labelledby="cta-h">
          <div className="wrap cta" data-reveal="">
            <h2 id="cta-h" className="disp h1">See you<br />on court.</h2>
            <div className="cta-side">
              <a href={bookUrl} className="book book-lg">Book your first session<Arrow /></a>
              {offer && <span className="small" style={{ color: 'var(--on-dark-2)' }}>{fmt(w.discountPence)} off with {w.code} · first booking only</span>}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
