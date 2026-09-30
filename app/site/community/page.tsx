import type { Metadata } from 'next'
import { CLUB_STATS } from '@/lib/site/stats'
import { INSTAGRAM, TIKTOK } from '@/lib/site/links'
import { ContactForm } from '../_components/ContactForm'
import { FaqList } from '../_components/FaqList'
import { Icon } from '../_components/Icon'
import { RotatingWord } from '../_components/RotatingWord'
import { PageHero, Ph, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Community',
  description: 'Join The Shuttle Social community: our WhatsApp group, Instagram and TikTok, the leaderboard, our guidelines and a suggestions box.',
  alternates: { canonical: '/community' },
}

const GUIDELINES: [string, string][] = [
  ['Be welcoming', 'Say hello to new faces and mix with people you don’t know yet. Everyone was new once.'],
  ['Play fair', 'Call the score honestly, give the benefit of the doubt on close shots, and play so the game is fun for everyone on court.'],
  ['Respect the venue', 'Arrive on time, wear non-marking shoes, and leave the hall as you found it.'],
  ['Look out for each other', 'If someone’s hurt or something doesn’t feel right, tell a host straight away. We want everyone to feel safe.'],
]

export default function CommunityPage() {
  const whatsapp = CLUB_STATS.whatsapp.toLocaleString('en-GB')
  return (
    <>
      <PageHero current="/community" kicker="Community"
        srTitle="More than a game."
        title={<>More than <RotatingWord words={['a game.', 'a club.', 'badminton.']} /></>}
        lead={`${whatsapp}+ people in our WhatsApp community, and new faces every week.`}
        chips={[<><Icon name="chat" size={18} />{whatsapp}+ on WhatsApp</>, <>New faces <strong>every week</strong></>, <><Icon name="bulb" size={18} />Your ideas welcome</>]}
        strip={{ label: 'Our community', items: [[`${whatsapp}+`, 'on WhatsApp'], [`${CLUB_STATS.players}+`, 'different players'], [`${CLUB_STATS.regulars}+`, 'regulars'], ['All', 'levels welcome'], ['1', 'suggestions box, always open']] }}>
        <a href="#suggestions" className="pill pill-cream">Share a suggestion</a>
      </PageHero>

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="join-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ right: '6%', top: '10%', width: '7rem', height: '7rem' }} />
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="join-h" className="disp h2">Join in</h2>
            </div>
            <div className="cards" data-reveal-stagger="">
              <div className="card card-deep" data-reveal="">
                <span className="icon"><Icon name="chat" /></span>
                <h3 className="h3">WhatsApp community</h3>
                <p>Session announcements and ticket releases land here first. The link is in our Instagram bio.</p>
                <a href={INSTAGRAM} className="pill pill-cream small" style={{ alignSelf: 'flex-start' }}>Find the link</a>
              </div>
              <div className="card c-lime" data-reveal="">
                <span className="icon"><Icon name="camera" /></span>
                <h3 className="h3" style={{ fontWeight: 800 }}>Instagram &amp; TikTok</h3>
                <p className="muted">Clips from the nights, results and what’s coming up.</p>
                <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a href={INSTAGRAM} className="pill pill-line small">Instagram</a>
                  <a href={TIKTOK} className="pill pill-line small">TikTok</a>
                </span>
              </div>
              <div className="card c-teal" data-reveal="">
                <span className="icon"><Icon name="trophy" /></span>
                <h3 className="h3" style={{ fontWeight: 800 }}>Leaderboard</h3>
                <p className="muted">See who’s on form. You only appear if you switch it on in My portal.</p>
                <a href="/leaderboard" className="pill pill-line small" style={{ alignSelf: 'flex-start' }}>View the leaderboard</a>
              </div>
            </div>
          </div>
        </section>

        <section className="sec faq-sec" aria-labelledby="rules-h">
          <span className="decor decor-lime" data-parallax="0.4" aria-hidden="true" style={{ right: '-10rem', top: '-6rem', width: '30rem', height: '30rem', opacity: 0.6 }} />
          <div className="wrap faq">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem', alignItems: 'flex-start' }}>
              <h2 id="rules-h" className="disp h2 faq-title">Community guidelines</h2>
              <p className="lead" style={{ color: 'var(--on-dark-2)', maxWidth: '24ch' }}>So every night is a good night, for everyone.</p>
            </div>
            <FaqList items={GUIDELINES} />
          </div>
        </section>

        <section className="sec story-sec" id="suggestions" aria-labelledby="sug-h">
          <span className="decor decor-green" data-parallax="0.3" aria-hidden="true" style={{ left: '-6rem', top: '10%', width: '24rem', height: '24rem' }} />
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <span className="kicker muted">Suggestions box</span>
              <h2 id="sug-h" className="disp h2">Tell us what you think</h2>
              <p className="lead muted">Advice, ideas, opinions, things we could do better. The community shapes the nights, so we’d love to hear it. You can stay anonymous.</p>
            </div>
            <div className="card card-deep static" data-reveal="" style={{ gap: '1.5rem' }}>
              <ContactForm kind="suggestion" />
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-real)' }} aria-labelledby="partners-h">
          <div className="wrap split">
            <h2 id="partners-h" className="disp h2" data-reveal="">Friends of the club</h2>
            <div className="card c-sage" data-reveal="">
              <span className="icon"><Icon name="users" /></span>
              <p className="lead"><Ph>Partner and community names, with a line about each, once you’re happy to show them</Ph></p>
              <p className="muted small">Want to work with us? <a href="/contact">Get in touch</a>.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
