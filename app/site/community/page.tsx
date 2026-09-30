import type { Metadata } from 'next'
import { CLUB_STATS } from '@/lib/site/stats'
import { INSTAGRAM, TIKTOK } from '@/lib/site/links'
import { PageHero, Ph, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Community',
  description: 'Join The Shuttle Social community: our WhatsApp group, Instagram and TikTok, the leaderboard and our community guidelines.',
  alternates: { canonical: '/community' },
}

// Placeholders until the club writes its own guidelines.
const GUIDELINES: [string, string][] = [
  ['Be welcoming', 'Guideline about including new players'],
  ['Play fair', 'Guideline about scores and line calls'],
  ['Respect the venue', 'Guideline about the hall, kit and times'],
  ['Look out for each other', 'Guideline about safety, and who to tell if something’s wrong'],
]

export default function CommunityPage() {
  return (
    <>
      <PageHero current="/community" kicker="Community" title="More than a game."
        lead={`${CLUB_STATS.whatsapp.toLocaleString('en-GB')}+ people in our WhatsApp community, and new faces every week.`} />

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="join-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="join-h" className="disp h2">Join in</h2>
            </div>
            <div className="cards" data-reveal-stagger="">
              <div className="card card-deep" data-reveal="">
                <span className="icon" aria-hidden="true">💬</span>
                <h3 className="h3">WhatsApp community</h3>
                <p>Session announcements and ticket releases land here first. The link is in our Instagram bio.</p>
                <a href={INSTAGRAM} className="pill pill-cream small" style={{ alignSelf: 'flex-start' }}>Find the link</a>
              </div>
              <div className="card" data-reveal="">
                <span className="icon" aria-hidden="true">📸</span>
                <h3 className="h3" style={{ fontWeight: 800 }}>Instagram &amp; TikTok</h3>
                <p className="muted">Clips from the nights, results and what’s coming up.</p>
                <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a href={INSTAGRAM} className="pill pill-line small">Instagram</a>
                  <a href={TIKTOK} className="pill pill-line small">TikTok</a>
                </span>
              </div>
              <div className="card" data-reveal="">
                <span className="icon" aria-hidden="true">🏆</span>
                <h3 className="h3" style={{ fontWeight: 800 }}>Leaderboard</h3>
                <p className="muted">See who’s on form. You only appear if you switch it on in My portal.</p>
                <a href="/leaderboard" className="pill pill-line small" style={{ alignSelf: 'flex-start' }}>View the leaderboard</a>
              </div>
            </div>
          </div>
        </section>

        <section className="sec faq-sec" aria-labelledby="rules-h">
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 id="rules-h" className="disp h2" style={{ color: 'var(--lime)' }}>Community guidelines</h2>
              <p className="lead" style={{ color: 'var(--on-dark-2)' }}>So every night is a good night, for everyone.</p>
            </div>
            <ol className="timeline on-dark" data-reveal-stagger="">
              {GUIDELINES.map(([t, b]) => <li key={t} data-reveal=""><div><strong>{t}</strong><span><Ph>{b}</Ph></span></div></li>)}
            </ol>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-real)' }} aria-labelledby="partners-h">
          <div className="wrap split">
            <h2 id="partners-h" className="disp h2" data-reveal="">Friends of the club</h2>
            <div className="prose lead" data-reveal="">
              <p><Ph>Partner and community names, with a line about each, once you’re happy to show them</Ph></p>
              <p className="muted small">Want to work with us? <a href="/contact">Get in touch</a>.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
