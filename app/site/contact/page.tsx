import type { Metadata } from 'next'
import { EMAIL, INSTAGRAM } from '@/lib/site/links'
import { ContactForm } from '../_components/ContactForm'
import { Icon, type IconName } from '../_components/Icon'
import { RotatingWord } from '../_components/RotatingWord'
import { PageHero, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with The Shuttle Social: questions, bookings, partnerships and venues.',
  alternates: { canonical: '/contact' },
}

const QUICK: [IconName, string, string, string, string, string][] = [
  ['ticket', 'Booking or can’t make it?', 'My portal shows your bookings and lets you release your space.', '/account', 'Open My portal', 'c-lime'],
  ['instagram', 'Quick question?', 'DM us on Instagram. It’s usually the fastest way to reach us.', INSTAGRAM, '@theshuttlesocial', 'c-mint'],
  ['mail', 'Prefer email?', 'Write to us directly any time.', `mailto:${EMAIL}`, EMAIL, 'c-teal'],
]

export default function ContactPage() {
  return (
    <>
      <PageHero current="/contact" kicker="Contact"
        srTitle="Say hello."
        title={<>Say <RotatingWord words={['hello.', 'hi.', 'hiya.']} /></>}
        lead="Questions, partnerships or venues: send us a message and we’ll reply by email."
        chips={[<><Icon name="mail" size={18} />We reply by email</>, <>DMs <strong>open</strong></>, <><Icon name="bulb" size={18} />Ideas welcome</>]} />

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="form-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ left: '4%', top: '6%', width: '8rem', height: '8rem' }} />
          <div className="wrap split">
            <div className="cards" style={{ gridTemplateColumns: '1fr' }} data-reveal-stagger="">
              {QUICK.map(([icon, t, b, href, cta, c]) => (
                <div key={t} className={`card ${c}`} data-reveal="">
                  <span className="icon"><Icon name={icon} /></span>
                  <h2 className="h3" style={{ fontWeight: 800 }}>{t}</h2>
                  <p className="muted">{b}</p>
                  <a href={href} className="small" style={{ fontWeight: 700, alignSelf: 'flex-start', textDecoration: 'none', borderBottom: '2px solid currentColor' }}>{cta} →</a>
                </div>
              ))}
              <div className="card c-sage" data-reveal="">
                <span className="icon"><Icon name="bulb" /></span>
                <h2 className="h3" style={{ fontWeight: 800 }}>Got an idea?</h2>
                <p className="muted">Share it in our suggestions box. You can stay anonymous.</p>
                <a href="/community#suggestions" className="small" style={{ fontWeight: 700, alignSelf: 'flex-start', textDecoration: 'none', borderBottom: '2px solid currentColor' }}>Suggestions box →</a>
              </div>
            </div>
            <div className="card card-deep static" data-reveal="" style={{ gap: '1.5rem' }}>
              <h2 id="form-h" className="disp" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', color: 'var(--lime)' }}>Send a message</h2>
              <ContactForm />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
