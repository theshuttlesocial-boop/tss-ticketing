import type { CSSProperties } from 'react'
import { getPublicSessions, type PublicSession } from '@/lib/sessions/public'
import { CLUB_STATS, getSessionsRun } from '@/lib/site/stats'
import { CountUp } from './_components/CountUp'
import { FaqList } from './_components/FaqList'
import { Gallery, type Clip } from './_components/Gallery'
import { HeroVisual } from './_components/HeroVisual'
import { HowItWorks, type Step } from './_components/HowItWorks'
import { RotatingWord } from './_components/RotatingWord'
import { Arrow, SiteFooter, SiteNav } from './_components/SiteChrome'
import { ScrollText } from './_components/ScrollText'
import { STORY } from '@/lib/site/story'
import { BOOK, INSTAGRAM, TIKTOK } from '@/lib/site/links'

// Availability and the session count refresh every minute.
export const revalidate = 60

export const metadata = { alternates: { canonical: '/' } }

const WORDS = ['social.', 'competitive.', 'for beginners.', 'every week.']

const INK = '#0F2A1A', CREAM = '#F4F7EC'
const PAL = {
  lime: { background: 'linear-gradient(150deg, #F0FF9A 0%, #D9F46B 55%, #BDEA5A 100%)', color: INK },
  cream: { background: '#F6F7F1', color: INK },
  mint: { background: 'linear-gradient(150deg, #D6F2E0 0%, #A6E0BF 100%)', color: INK },
  teal: { background: 'linear-gradient(150deg, #B4ECDC 0%, #72CBAE 100%)', color: INK },
  forest: { background: 'linear-gradient(150deg, #3FA66A 0%, #1E6B3E 100%)', color: CREAM },
  sage: { background: 'linear-gradient(150deg, #F4F9E2 0%, #DCEDB2 100%)', color: INK },
  night: { background: '#0F2A1A', color: CREAM },
}

const FAQS: [string, string][] = [
  ['How do I join?', 'Join our WhatsApp community linked in the @theshuttlesocial IG bio for all details about upcoming sessions and ticket releases.'],
  ['Do I need to be good at badminton?', 'Not at all! We welcome all levels, from complete beginners to experienced players.'],
  ['How do I book a session? Can I just show up?', 'Sessions are ticket-only. Spaces are limited and sell out fast. Grab yours through our ticket link, always shared on WhatsApp and Instagram.'],
  ['Where are sessions held?', 'Our sessions are currently mainly in West London. We’ll be starting up again in East and South London.'],
  ['What’s the format of a session?', 'Timed rounds of doubles with a new partner every round, finishing with a grand final.'],
  ['Do I need to bring equipment?', 'Shuttles are provided. Please bring your own racket if possible. A few spares will be available.'],
]

const STEPS: Step[] = [
  { title: 'Book a space', body: '£10, no membership. Plans change? Release your space and the waitlist gets it.', kicker: 'Booking', big: 'You’re in for Thursday.', small: 'Your ticket and QR code are in your email and My sessions.' },
  { title: 'Scan in at the door', body: 'Your phone shows your court and the round timer.', kicker: 'Round 1', big: 'Court 3', small: 'Rounds are timed. Scores go in on your phone.' },
  { title: 'Play, then the grand final', body: 'Timed rounds of doubles with a new partner every round. The night ends with a grand final.', kicker: 'End of the night', big: 'Grand final', small: 'The top players of the night meet on court 1.' },
]

// Placeholders until the club's own clips arrive (self-hosted, muted, no tracking embeds).
const CLIPS: Clip[] = [
  { label: '[Reel · muted loop]', caption: '[Caption: a long rally on court 2]', bg: 'linear-gradient(160deg, #1E6B3E, #0E3B24)', fg: '#B9D3B4' },
  { label: '[TikTok · muted loop]', caption: '[Caption: new partners, round 3]', bg: 'linear-gradient(160deg, #8BE3B0, #2E8B57)', fg: INK },
  { label: '[Reel · muted loop]', caption: '[Caption: the grand final]', bg: 'linear-gradient(160deg, #D9F46B, #8BE3B0)', fg: INK },
  { label: '[TikTok · muted loop]', caption: '[Caption: checking in at the door]', bg: 'linear-gradient(200deg, #2E8B57, #0E3B24)', fg: '#B9D3B4' },
  { label: '[Reel · muted loop]', caption: '[Caption: first-timers on court 4]', bg: 'linear-gradient(160deg, #155A34, #0B2416)', fg: '#B9D3B4' },
  { label: '[TikTok · muted loop]', caption: '[Caption: end-of-night photo]', bg: 'linear-gradient(160deg, #BDEA72, #2E8B57)', fg: INK },
]

const fmt = (n: number) => n.toLocaleString('en-GB')
/** CSS custom properties for an inline style. */
const vars = (v: Record<`--${string}`, string | number>) => v as CSSProperties

/** Next sessions for the "This week" cards: up to the next 7 days, else the next two coming up. */
function pickUpcoming(sessions: PublicSession[], now = new Date()) {
  const weekOut = new Date(now.getTime() + 7 * 864e5).toISOString().split('T')[0]
  const thisWeek = sessions.filter((s) => s.date <= weekOut)
  return thisWeek.length ? { heading: 'This week', list: thisWeek.slice(0, 4) } : { heading: 'Coming up', list: sessions.slice(0, 2) }
}

function sessionStatus(s: PublicSession) {
  if (s.status === 'coming_soon') {
    const opens = s.opens_at ? new Date(s.opens_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null
    return { tag: 'Coming soon', cta: opens ? `Tickets open ${opens} →` : 'Tickets open soon →' }
  }
  if (s.availability === 'sold_out') return { tag: 'Full', cta: 'Join the waitlist →' }
  if (s.availability === 'limited') return { tag: `${s.spotsRemaining} left`, cta: 'Book now →' }
  return { tag: 'Spaces available', cta: 'Book now →' }
}

export default async function Home() {
  const [pub, sessionsRun] = await Promise.all([getPublicSessions(), getSessionsRun()])
  const upcoming = pickUpcoming('sessions' in pub ? pub.sessions : [])

  const strip = [
    { n: `${fmt(CLUB_STATS.players)}+`, t: 'different players', ...PAL.lime, nc: INK, rot: -2 },
    { n: `${fmt(CLUB_STATS.whatsapp)}+`, t: 'in our WhatsApp community', ...PAL.cream, nc: '#1E6B3E', rot: 1.5 },
    { n: `${CLUB_STATS.fastestSellOutSeconds}s`, t: 'fastest sell-out', ...PAL.night, nc: '#D9F46B', rot: -1 },
    { n: `${CLUB_STATS.regulars}+`, t: 'regulars with 10+ sessions', ...PAL.mint, nc: INK, rot: 2 },
    { n: fmt(sessionsRun), t: 'sessions and counting', ...PAL.teal, nc: INK, rot: -1.5 },
    { n: '1 yr', t: 'of social badminton', ...PAL.sage, nc: '#1E6B3E', rot: 1 },
  ]

  const tiles = [
    { kicker: 'Players', to: CLUB_STATS.players, suffix: '+', caption: 'different people have played with us', span: 5, pspan: 2, big: true, pal: PAL.lime, bb: INK, bf: CREAM },
    { kicker: 'Sessions · live', to: sessionsRun, suffix: '', caption: 'sessions run, and counting', span: 4, pspan: 1, pal: PAL.cream, bb: '#E6EFDD', bf: INK },
    { kicker: 'Running', to: 1, suffix: ' yr', caption: 'since August 2025', span: 3, pspan: 1, pal: PAL.mint, bb: '#FFFFFF', bf: INK },
    { kicker: 'Regulars', to: CLUB_STATS.regulars, suffix: '+', caption: 'players with 10+ sessions', span: 3, pspan: 1, pal: PAL.teal, bb: INK, bf: CREAM },
    { kicker: 'Fastest sell-out', to: CLUB_STATS.fastestSellOutSeconds, suffix: 's', caption: 'from tickets live to sold out', span: 4, pspan: 1, pal: PAL.forest, bb: '#D9F46B', bf: INK },
    { kicker: 'Community', to: CLUB_STATS.whatsapp, suffix: '+', caption: 'people in our WhatsApp community', span: 5, pspan: 2, big: true, pal: PAL.sage, bb: '#1E6B3E', bf: CREAM },
  ]

  // Structured data for search: the club, plus each upcoming session as an event.
  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'SportsOrganization', name: 'The Shuttle Social', sport: 'Badminton',
      url: 'https://theshuttlesocial.com', logo: 'https://theshuttlesocial.com/logo.jpg', email: 'theshuttlesocial@gmail.com',
      description: 'Social badminton in West London for every level.', areaServed: 'London', sameAs: [INSTAGRAM, TIKTOK],
    },
    ...upcoming.list.filter((s) => s.status === 'open').map((s) => ({
      '@context': 'https://schema.org', '@type': 'SportsEvent', name: s.title, sport: 'Badminton',
      startDate: `${s.date}T${s.time}`, eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: String(s.venue), address: { '@type': 'PostalAddress', streetAddress: String(s.venue), addressLocality: 'London', addressCountry: 'GB' } },
      organizer: { '@type': 'SportsOrganization', name: 'The Shuttle Social', url: 'https://theshuttlesocial.com' },
      offers: { '@type': 'Offer', url: 'https://tickets.theshuttlesocial.com/tickets', price: (s.price_pence / 100).toFixed(2), priceCurrency: 'GBP', availability: s.availability === 'sold_out' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' },
    })),
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <SiteNav />

        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="badge"><span className="dot" />Thursdays &amp; Fridays · Harrow</span>
            <h1 className="disp h1">
              <span className="sr-only">Badminton that’s social, competitive, for beginners, every week.</span>
              <span aria-hidden="true">Badminton<br />that’s <RotatingWord words={WORDS} /></span>
            </h1>
            <p className="lead" style={{ maxWidth: '34ch', color: 'var(--on-dark-2)' }}>Come on your own. We match you to close games and a new partner every round.</p>
            <div className="hero-actions">
              <a href={BOOK} className="book book-lg">Book a session<Arrow /></a>
              <a href="#sessions" className="pill pill-ghost">See this week</a>
            </div>
          </div>
          <HeroVisual />
        </div>

        <div className="strip" role="region" aria-label="The Shuttle Social in numbers">
          <div className="strip-track">
            {[false, true].map((copy) => (
              <ul key={String(copy)} className="strip-set" aria-hidden={copy || undefined}>
                {strip.map((m) => (
                  <li key={m.t}>
                    <span className="mchip" style={{ background: m.background, color: m.color, ...vars({ '--rot': `${m.rot}deg` }) }}>
                      <span className="num" style={{ color: m.nc }}>{m.n}</span><span className="mt">{m.t}</span>
                    </span>
                    <svg className="msep" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4l4.2 11.8L36 20l-11.8 4.2L20 36l-4.2-11.8L4 20l11.8-4.2z" fill="#D9F46B" /></svg>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>

      <main id="main">
        <section className="sec" id="sessions" style={{ background: 'var(--s-week)' }} aria-labelledby="week-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ right: '6%', top: '14%', width: '7rem', height: '7rem' }} />
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h2 id="week-h" className="disp h2">{upcoming.heading}</h2>
                <span className="live small"><span className="dot" />Live from bookings</span>
              </div>
              <a href={BOOK} className="small" style={{ fontWeight: 700, textDecoration: 'none', borderBottom: '2px solid currentColor' }}>All sessions →</a>
            </div>
            {upcoming.list.length ? (
              <div className="days" data-reveal-stagger="">
                {upcoming.list.map((s, k) => {
                  const d = new Date(s.date + 'T12:00:00Z')
                  const [venue, postcode] = String(s.venue).split(/,\s*(?=[A-Z]{1,2}\d)/)
                  const st = sessionStatus(s)
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
                        <span className="h3">{s.time} · {venue}</span>
                        <span className="small" style={{ opacity: 0.75 }}>£{(s.price_pence / 100).toFixed(s.price_pence % 100 ? 2 : 0)} · all levels{postcode ? ` · ${postcode}` : ''}</span>
                      </div>
                      <span className="day-cta">{st.cta}</span>
                    </a>
                  )
                })}
              </div>
            ) : (
              <p className="empty lead" data-reveal="">New sessions are announced on WhatsApp and Instagram first. <a href={INSTAGRAM}>Follow @theshuttlesocial</a>.</p>
            )}
          </div>
        </section>

        <section className="sec stats" aria-labelledby="stats-h">
          <span className="decor decor-green" data-parallax="0.45" aria-hidden="true" style={{ left: '-5rem', bottom: '8%', width: '22rem', height: '22rem' }} />
          <span className="decor decor-lime" data-parallax="0.3" aria-hidden="true" style={{ right: '4%', top: '10%', width: '9rem', height: '9rem', opacity: 0.5 }} />
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="stats-h" className="disp h2">One year on court.</h2>
              <p className="small" style={{ maxWidth: '34ch', color: 'var(--on-dark-2)' }}>Since our first session in August 2025. The session count updates after every night.</p>
            </div>
            <div className="stat-grid" data-reveal-stagger="">
              {tiles.map((s) => (
                <div key={s.kicker} className="tile" data-reveal="" style={{ ...s.pal, ...vars({ '--span': s.span, '--pspan': s.pspan, '--tn': s.big ? 'clamp(4.5rem, 9vw, 8.5rem)' : 'clamp(3.5rem, 6.5vw, 6.25rem)', '--tnp': s.big ? '4.5rem' : '3rem' }) }}>
                  <span className="kicker" style={{ opacity: 0.8 }}>{s.kicker}</span>
                  <CountUp className="num" to={s.to} suffix={s.suffix} />
                  <span className="bubble" style={{ background: s.bb, color: s.bf }}>{s.caption}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec story-sec" id="story" aria-labelledby="story-h">
          <span className="decor decor-green" data-parallax="0.4" aria-hidden="true" style={{ right: '-6rem', top: '10%', width: '24rem', height: '24rem' }} />
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
              <span className="kicker muted">Since August 2025</span>
              <h2 id="story-h" className="disp h2">Our story</h2>
            </div>
            <div>
              <ScrollText paragraphs={STORY} />
              <div className="story-sig" data-reveal="">
                <a href="/join-us" className="pill pill-ghost small">Join us</a>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="how" style={{ background: 'var(--s-how)' }} aria-labelledby="how-h">
          <HowItWorks steps={STEPS} />
        </section>

        <section className="sec faq-sec" id="faqs" aria-labelledby="faq-h">
          <span className="decor decor-lime" data-parallax="0.4" aria-hidden="true" style={{ right: '-10rem', top: '-6rem', width: '32rem', height: '32rem', opacity: 0.6 }} />
          <div className="wrap faq">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem', alignItems: 'flex-start' }}>
              <h2 id="faq-h" className="disp h2 faq-title">FAQs</h2>
              <p className="lead" style={{ color: 'var(--on-dark-2)', maxWidth: '24ch' }}>Have more questions? DM us on Instagram.</p>
              <a href={INSTAGRAM} className="pill pill-cream small">@theshuttlesocial</a>
            </div>
            <FaqList items={FAQS} />
          </div>
        </section>

        <Gallery clips={CLIPS}>
          <div className="wrap head-row" data-reveal="" style={{ marginBottom: 0 }}>
            <h2 id="real-h" className="disp h2">Real nights.<br />Real people.</h2>
            <span style={{ display: 'flex', gap: '0.625rem' }}>
              <a href={INSTAGRAM} className="pill pill-line small">Instagram</a>
              <a href={TIKTOK} className="pill pill-line small">TikTok</a>
            </span>
          </div>
        </Gallery>

        <section className="sec cta-sec" aria-labelledby="cta-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ left: '38%', top: '20%', width: '6rem', height: '6rem', opacity: 0.7 }} />
          <div className="wrap cta" data-reveal="">
            <h2 id="cta-h" className="disp h1">See you<br />on court.</h2>
            <div className="cta-side">
              <a href={BOOK} className="book book-lg">Book a session<Arrow /></a>
              <span className="small" style={{ color: 'var(--on-dark-2)' }}>Thursdays &amp; Fridays · £10 · no membership</span>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
