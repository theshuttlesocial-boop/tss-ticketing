import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { CLUB_STATS, getSessionsRun } from '@/lib/site/stats'
import { BOOK } from '@/lib/site/links'
import { STORY } from '@/lib/site/story'
import { CountUp } from '../_components/CountUp'
import { Icon, type IconName } from '../_components/Icon'
import { RotatingWord } from '../_components/RotatingWord'
import { ScrollText } from '../_components/ScrollText'
import { Arrow, PageHero, SiteFooter } from '../_components/SiteChrome'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'About',
  description: 'The Shuttle Social started with a group of friends picking badminton back up, and grew into a community across London. Come on your own, play with everyone.',
  alternates: { canonical: '/about' },
}

const VALUES: [IconName, string, string, string][] = [
  ['users', 'Come on your own', 'Most people do. A new partner every round means you’ll have played with half the room by the end of the night.', 'c-lime'],
  ['shuttle', 'Every level', 'From complete beginners to experienced players. We match you to close games, so everyone gets a proper game.', 'c-mint'],
  ['heart', 'Friends first', 'Scores count and there’s a grand final, but the friendships are why people keep coming back.', 'c-teal'],
]

const INK = '#0F2A1A', CREAM = '#F4F7EC'
const vars = (v: Record<`--${string}`, string | number>) => v as CSSProperties

export default async function AboutPage() {
  const sessionsRun = await getSessionsRun()
  const tiles = [
    { kicker: 'Players', to: CLUB_STATS.players, suffix: '+', caption: 'different people have played with us', span: 5, pspan: 2, big: true, bg: 'linear-gradient(150deg, #F0FF9A 0%, #D9F46B 55%, #BDEA5A 100%)', fg: INK, bb: INK, bf: CREAM },
    { kicker: 'Sessions · live', to: sessionsRun, suffix: '', caption: 'nights on court, and counting', span: 4, pspan: 1, bg: 'linear-gradient(150deg, #D6F2E0 0%, #A6E0BF 100%)', fg: INK, bb: '#0E3B24', bf: CREAM },
    { kicker: 'Regulars', to: CLUB_STATS.regulars, suffix: '+', caption: 'players with 10+ sessions', span: 3, pspan: 1, bg: 'linear-gradient(150deg, #B4ECDC 0%, #72CBAE 100%)', fg: INK, bb: INK, bf: CREAM },
    { kicker: 'Community', to: CLUB_STATS.whatsapp, suffix: '+', caption: 'people in our WhatsApp community', span: 12, pspan: 2, big: true, bg: 'linear-gradient(150deg, #3FA66A 0%, #1E6B3E 100%)', fg: CREAM, bb: '#D9F46B', bf: INK },
  ]

  return (
    <>
      <PageHero current="/about" kicker="About us"
        srTitle="Badminton, but make it social."
        title={<>Badminton, but make it <RotatingWord words={['social.', 'friends.', 'community.']} /></>}
        lead="What started as a few friends picking up their rackets again is now a community of hundreds."
        chips={[<><Icon name="calendar" size={18} />Since August 2025</>, <><strong>{CLUB_STATS.players}+</strong> players</>, <><Icon name="heart" size={18} />Friends of friends</>]}
        strip={{ label: 'The Shuttle Social in numbers', items: [[`${CLUB_STATS.players}+`, 'different players'], [String(sessionsRun), 'sessions and counting'], [`${CLUB_STATS.regulars}+`, 'regulars'], [`${CLUB_STATS.whatsapp.toLocaleString('en-GB')}+`, 'on WhatsApp'], ['1 yr', 'of social badminton']] }} />

      <main id="main">
        <section className="sec story-sec" aria-labelledby="story-h">
          <span className="decor decor-green" data-parallax="0.4" aria-hidden="true" style={{ right: '-6rem', top: '10%', width: '24rem', height: '24rem' }} />
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <span className="kicker muted">Since August 2025</span>
              <h2 id="story-h" className="disp h2">Our story</h2>
            </div>
            <ScrollText paragraphs={STORY} />
          </div>
        </section>

        <section className="sec stats" aria-labelledby="num-h">
          <span className="decor decor-green" data-parallax="0.45" aria-hidden="true" style={{ left: '-5rem', bottom: '8%', width: '22rem', height: '22rem' }} />
          <span className="decor decor-lime" data-parallax="0.3" aria-hidden="true" style={{ right: '4%', top: '10%', width: '9rem', height: '9rem', opacity: 0.5 }} />
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="num-h" className="disp h2">One year on court.</h2>
              <p className="small" style={{ maxWidth: '34ch', color: 'var(--on-dark-2)' }}>The session count updates after every night.</p>
            </div>
            <div className="stat-grid" data-reveal-stagger="">
              {tiles.map((s) => (
                <div key={s.kicker} className="tile" data-reveal="" style={{ background: s.bg, color: s.fg, ...vars({ '--span': s.span, '--pspan': s.pspan, '--tn': s.big ? 'clamp(4.5rem, 9vw, 8.5rem)' : 'clamp(3.5rem, 6.5vw, 6.25rem)', '--tnp': s.big ? '4.5rem' : '3rem' }) }}>
                  <span className="kicker" style={{ opacity: 0.8 }}>{s.kicker}</span>
                  <CountUp className="num" to={s.to} suffix={s.suffix} />
                  <span className="bubble" style={{ background: s.bb, color: s.bf }}>{s.caption}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-how)' }} aria-labelledby="val-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ right: '8%', top: '12%', width: '8rem', height: '8rem' }} />
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

        <section className="sec cta-sec" aria-labelledby="cta-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ left: '38%', top: '20%', width: '6rem', height: '6rem', opacity: 0.7 }} />
          <div className="wrap cta" data-reveal="">
            <h2 id="cta-h" className="disp h1">See you<br />on court.</h2>
            <div className="cta-side">
              <a href={BOOK} className="book book-lg">Book a session<Arrow /></a>
              <a href="/join-us" className="pill pill-ghost small">Or help run the nights</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
