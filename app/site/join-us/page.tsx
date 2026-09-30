import type { Metadata } from 'next'
import { ContactForm } from '../_components/ContactForm'
import { Icon } from '../_components/Icon'
import { RotatingWord } from '../_components/RotatingWord'
import { PageHero, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Join us',
  description: 'Help build The Shuttle Social: hosting, social media, content, coaching, events and more. Volunteering to start with.',
  alternates: { canonical: '/join-us' },
}

export default function JoinUsPage() {
  return (
    <>
      <PageHero current="/join-us" kicker="Join us"
        srTitle="Help build TSS."
        title={<>Help build <RotatingWord words={['TSS.', 'the nights.', 'the community.']} /></>}
        lead="Hosting, social media, content, coaching, events and more. Every part of TSS matters."
        chips={[<><Icon name="gift" size={18} />Free sessions</>, <>Path to <strong>the core team</strong></>, <><Icon name="star" size={18} />Every skill counts</>]}
        strip={{ label: 'Ways to help', items: [['Host', 'our sessions'], ['Grow', 'our socials'], ['Create', 'content'], ['Coach', 'beginners'], ['Plan', 'events'], ['Build', 'partnerships']] }}>
        <a href="#apply" className="pill pill-cream">Apply now</a>
      </PageHero>

      <main id="main">
        <section className="sec" id="apply" style={{ background: 'var(--s-real)' }} aria-labelledby="apply-h">
          <span className="decor decor-green" data-parallax="0.3" aria-hidden="true" style={{ left: '-6rem', top: '10%', width: '24rem', height: '24rem' }} />
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 id="apply-h" className="disp h2">Apply to join the team</h2>
              <p className="lead muted">
                Roles are on a volunteering basis to start with, until opportunities for fixed roles come up.
              </p>
              <div className="cards" style={{ gridTemplateColumns: '1fr' }} data-reveal-stagger="">
                <div className="card c-lime" data-reveal="">
                  <span className="icon"><Icon name="gift" /></span>
                  <h3 className="h3" style={{ fontWeight: 800 }}>Free sessions</h3>
                  <p className="muted">A thank you for the time you give.</p>
                </div>
                <div className="card c-teal" data-reveal="">
                  <span className="icon"><Icon name="star" /></span>
                  <h3 className="h3" style={{ fontWeight: 800 }}>A path to the core team</h3>
                  <p className="muted">Help shape where TSS goes next.</p>
                </div>
              </div>
            </div>
            <div className="card card-deep static" data-reveal="" style={{ gap: '1.5rem' }}>
              <p style={{ color: 'var(--on-dark-2)' }}>Three short questions help us get to know you. There are no wrong answers.</p>
              <ContactForm kind="join" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
