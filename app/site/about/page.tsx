import type { Metadata } from 'next'
import { CLUB_STATS, getSessionsRun } from '@/lib/site/stats'
import { BOOK } from '@/lib/site/links'
import { CountUp } from '../_components/CountUp'
import { Arrow, PageHero, Ph, SiteFooter } from '../_components/SiteChrome'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'About',
  description: 'The Shuttle Social runs social badminton in London for every level, since August 2025. Come on your own, play with everyone.',
  alternates: { canonical: '/about' },
}

const VALUES = [
  ['🤝', 'Come on your own', 'Most people do. A new partner every round means you’ll have played with half the room by the end of the night.'],
  ['🏸', 'Every level', 'From complete beginners to experienced players. Games are kept close, so everyone gets a proper game.'],
  ['🔥', 'A little competitive', 'Scores count and the night ends with a grand final, but it’s the people that keep everyone coming back.'],
]

// Placeholders until the club supplies names and photos (with consent).
const TEAM = [
  ['Founder', 'Name'],
  ['Session lead', 'Name'],
  ['Session lead', 'Name'],
]

export default async function AboutPage() {
  const sessionsRun = await getSessionsRun()
  const stats = [
    { to: CLUB_STATS.players, suffix: '+', t: 'different players', bg: 'linear-gradient(150deg, #F0FF9A 0%, #D9F46B 55%, #BDEA5A 100%)' },
    { to: sessionsRun, suffix: '', t: 'sessions run', bg: 'linear-gradient(150deg, #D6F2E0 0%, #A6E0BF 100%)' },
    { to: CLUB_STATS.regulars, suffix: '+', t: 'regulars with 10+ sessions', bg: 'linear-gradient(150deg, #B4ECDC 0%, #72CBAE 100%)' },
    { to: CLUB_STATS.whatsapp, suffix: '+', t: 'in our WhatsApp community', bg: 'linear-gradient(150deg, #F4F9E2 0%, #DCEDB2 100%)' },
  ]

  return (
    <>
      <PageHero current="/about" kicker="About us" title="Badminton, but make it social."
        lead="Since August 2025 we’ve been running nights where you can turn up alone and leave with a group of friends." />

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="story-h">
          <div className="wrap split">
            <h2 id="story-h" className="disp h2" data-reveal="">Our story</h2>
            <div className="prose lead" data-reveal="">
              <p><Ph>How The Shuttle Social started: who started it, why, and what the first session in August 2025 was like</Ph></p>
              <p><Ph>How it grew: from the first night to Thursdays and Fridays, the WhatsApp community and sell-outs</Ph></p>
              <p><Ph>What you want every player to feel when they leave</Ph></p>
            </div>
          </div>
        </section>

        <section className="sec stats" aria-labelledby="num-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="num-h" className="disp h2">One year on court.</h2>
            </div>
            <div className="cards stat-cards" data-reveal-stagger="">
              {stats.map((s) => (
                <div key={s.t} className="card" data-reveal="" style={{ background: s.bg, color: '#0F2A1A', border: 0, justifyContent: 'space-between' }}>
                  <CountUp className="num" to={s.to} suffix={s.suffix} />
                  <span style={{ fontWeight: 700 }}>{s.t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-how)' }} aria-labelledby="val-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="val-h" className="disp h2">What we’re about</h2>
            </div>
            <div className="cards" data-reveal-stagger="">
              {VALUES.map(([icon, t, b]) => (
                <div key={t} className="card" data-reveal="">
                  <span className="icon" aria-hidden="true">{icon}</span>
                  <h3 className="h3" style={{ fontWeight: 800 }}>{t}</h3>
                  <p className="muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-real)' }} aria-labelledby="team-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="team-h" className="disp h2">The team</h2>
              <a href="/volunteer" className="pill pill-line small">Join the team</a>
            </div>
            <div className="cards" data-reveal-stagger="">
              {TEAM.map(([role, name], i) => (
                <div key={i} className="card" data-reveal="">
                  <div aria-hidden="true" style={{ aspectRatio: '4 / 3', borderRadius: '1.25rem', background: 'linear-gradient(160deg, #1E6B3E, #0E3B24)', display: 'grid', placeItems: 'center', color: '#B9D3B4', fontSize: 'var(--fs-small)' }}>[Photo]</div>
                  <h3 className="h3" style={{ fontWeight: 800 }}><Ph>{name}</Ph></h3>
                  <span className="kicker muted">{role}</span>
                  <p className="muted small"><Ph>One line about them</Ph></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec cta-sec" aria-labelledby="cta-h">
          <div className="wrap cta" data-reveal="">
            <h2 id="cta-h" className="disp h1">See you<br />on court.</h2>
            <div className="cta-side">
              <a href={BOOK} className="book book-lg">Book a session<Arrow /></a>
              <span className="small" style={{ color: 'var(--on-dark-2)' }}>£10 · all levels · no membership</span>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
