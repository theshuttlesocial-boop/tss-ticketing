import type { Metadata } from 'next'
import { getPublicSessions, type PublicSession } from '@/lib/sessions/public'
import { CLUB_STATS, getSessionsRun } from '@/lib/site/stats'
import { BOOK, INSTAGRAM } from '@/lib/site/links'
import { STORY } from '@/lib/site/story'
import { FaqList } from '../_components/FaqList'
import { HowItWorks, type Step } from '../_components/HowItWorks'
import { Icon, type IconName } from '../_components/Icon'
import { RotatingWord } from '../_components/RotatingWord'
import { ScrollText } from '../_components/ScrollText'
import { Arrow, PageHero, SiteFooter } from '../_components/SiteChrome'

// Availability refreshes every minute.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Sessions & about us',
  description: 'Upcoming social badminton sessions in London with live availability, and the story of The Shuttle Social. £10, all levels, no membership.',
  alternates: { canonical: '/sessions' },
}

const VALUES: [IconName, string, string, string][] = [
  ['users', 'Come on your own', 'Most people do. A new partner every round means you’ll have played with half the room by the end of the night.', 'c-lime'],
  ['shuttle', 'Every level', 'From complete beginners to experienced players. We match you to close games, so everyone gets a proper game.', 'c-mint'],
  ['heart', 'Friends first', 'Scores count and there’s a grand final, but the friendships are why people keep coming back.', 'c-teal'],
]

function status(s: PublicSession) {
  if (s.status === 'coming_soon') {
    const opens = s.opens_at ? new Date(s.opens_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null
    return { tag: 'Coming soon', cta: opens ? `Tickets open ${opens}` : 'Tickets open soon' }
  }
  if (s.availability === 'sold_out') return { tag: 'Full', cta: 'Join the waitlist →' }
  if (s.availability === 'limited') return { tag: `${s.spotsRemaining} left`, cta: 'Book now →' }
  return { tag: 'Spaces available', cta: 'Book now →' }
}

const NIGHT: Step[] = [
  { title: 'Arrive and check in', body: 'Show the QR code from your booking email or My portal at the door.', kicker: 'At the door', big: 'Checked in', small: 'You’re in. Your court shows up on your phone.' },
  { title: 'Get your court', body: 'Your phone shows your court and the round timer.', kicker: 'Round 1', big: 'Court 3', small: 'Rounds are timed, so everyone keeps playing.' },
  { title: 'Timed rounds of doubles', body: 'A new partner every round. Scores go in on your phone.', kicker: 'Next up', big: 'New partner', small: 'Every round, someone new to play with.' },
  { title: 'Grand final', body: 'The night finishes with a grand final.', kicker: 'End of the night', big: 'Grand final', small: 'The top players of the night meet on court 1.' },
]

const TICKETS: [string, string][] = [
  ['When do tickets come out?', `New sessions are shared in our WhatsApp community and on Instagram first. They go fast: our quickest sell-out took ${CLUB_STATS.fastestSellOutSeconds} seconds.`],
  ['It’s sold out. What now?', 'Join the waitlist. If a space opens up, the next person on the list gets an email and a short time to claim it.'],
  ['I can’t make it any more', 'Release your space from My portal. When someone takes it, you get credit or a refund (see our terms).'],
  ['Can I book for friends?', 'Yes. You can book more than one space and add their names when you book.'],
]

export default async function SessionsPage() {
  const [pub, sessionsRun] = await Promise.all([getPublicSessions(), getSessionsRun()])
  const sessions = 'sessions' in pub ? pub.sessions : []

  return (
    <>
      <PageHero current="/sessions" kicker="Sessions & about us"
        srTitle="Your next night on court."
        title={<>Your next night <RotatingWord words={['on court.', 'of doubles.', 'with friends.']} /></>}
        lead="Every session is ticket-only and spaces go fast. £10, all levels, no membership."
        chips={[<><Icon name="ticket" size={18} />£10 · all levels</>, <>Next up · <strong>new partner</strong></>, <><Icon name="flame" size={18} />Sold out in {CLUB_STATS.fastestSellOutSeconds}s</>]}
        strip={{ label: 'The Shuttle Social at a glance', items: [[`${CLUB_STATS.players}+`, 'different players'], [String(sessionsRun), 'sessions and counting'], ['£10', 'per session'], ['All', 'levels welcome'], [`${CLUB_STATS.regulars}+`, 'regulars'], [`${CLUB_STATS.fastestSellOutSeconds}s`, 'fastest sell-out']] }}>
        <a href={BOOK} className="book book-lg">Book a session<Arrow /></a>
      </PageHero>

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="up-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ right: '6%', top: '10%', width: '7rem', height: '7rem' }} />
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

        <section className="sec story-sec" id="story" aria-labelledby="story-h">
          <span className="decor decor-lime" data-parallax="0.4" aria-hidden="true" style={{ right: '-6rem', top: '8%', width: '22rem', height: '22rem', opacity: 0.35 }} />
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <span className="kicker" style={{ color: 'var(--lime)' }}>About us · since August 2025</span>
              <h2 id="story-h" className="disp h2">Our story</h2>
            </div>
            <ScrollText paragraphs={STORY} />
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-real)' }} aria-labelledby="val-h">
          <span className="decor decor-green" data-parallax="0.35" aria-hidden="true" style={{ right: '6%', top: '10%', width: '10rem', height: '10rem' }} />
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="val-h" className="disp h2">What we’re about</h2>
            </div>
            <div className="cards" data-reveal-stagger="">
              {VALUES.map(([icon, t, b, c]) => (
                <div key={t} className={`card ${c}`} data-reveal="">
                  <span className="icon"><Icon name={icon} /></span>
                  <h3 className="h3" style={{ fontWeight: 800 }}>{t}</h3>
                  <p className="muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-how)' }} aria-labelledby="night-h">
          <HowItWorks steps={NIGHT} title="What a night looks like" headingId="night-h" intro="Come on your own or bring friends. Everyone plays with everyone." />
        </section>

        <section className="sec faq-sec" aria-labelledby="tix-h">
          <span className="decor decor-lime" data-parallax="0.4" aria-hidden="true" style={{ right: '-10rem', top: '-6rem', width: '30rem', height: '30rem', opacity: 0.6 }} />
          <div className="wrap faq">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem', alignItems: 'flex-start' }}>
              <h2 id="tix-h" className="disp h2 faq-title">How tickets work</h2>
              <p className="lead" style={{ color: 'var(--on-dark-2)', maxWidth: '26ch' }}>Booking, waitlists and what happens if plans change.</p>
              <a href="/terms" className="pill pill-cream small">Booking terms</a>
            </div>
            <FaqList items={TICKETS} />
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="where-h">
          <span className="decor decor-green" data-parallax="0.3" aria-hidden="true" style={{ left: '-6rem', bottom: '0', width: '22rem', height: '22rem' }} />
          <div className="wrap split">
            <h2 id="where-h" className="disp h2" data-reveal="">Where we play</h2>
            <div className="cards" data-reveal-stagger="">
              <div className="card c-lime" data-reveal="">
                <span className="icon"><Icon name="pin" /></span>
                <h3 className="h3" style={{ fontWeight: 800 }}>West London</h3>
                <p className="muted">Where most of our sessions are right now.</p>
              </div>
              <div className="card c-teal" data-reveal="">
                <span className="icon"><Icon name="calendar" /></span>
                <h3 className="h3" style={{ fontWeight: 800 }}>East and South London</h3>
                <p className="muted">We’ll be starting up again here. Follow us to hear first.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
