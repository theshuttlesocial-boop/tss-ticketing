import type { Metadata } from 'next'
import { EMAIL, INSTAGRAM } from '@/lib/site/links'
import { ContactForm } from '../_components/ContactForm'
import { PageHero, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with The Shuttle Social: questions, bookings, partnerships, venues and press.',
  alternates: { canonical: '/contact' },
}

const QUICK = [
  ['🎟', 'Booking or can’t make it?', 'My portal shows your bookings and lets you release your space.', '/account', 'Open My portal'],
  ['💬', 'Quick question?', 'DM us on Instagram. It’s usually the fastest way to reach us.', INSTAGRAM, '@theshuttlesocial'],
  ['✉️', 'Prefer email?', 'Write to us directly any time.', `mailto:${EMAIL}`, EMAIL],
]

export default function ContactPage() {
  return (
    <>
      <PageHero current="/contact" kicker="Contact" title="Say hello."
        lead="Questions, partnerships, venues or press: send us a message and we’ll reply by email." />

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="form-h">
          <div className="wrap split">
            <div className="cards" style={{ gridTemplateColumns: '1fr' }} data-reveal-stagger="">
              {QUICK.map(([icon, t, b, href, cta]) => (
                <div key={t} className="card" data-reveal="">
                  <span className="icon" aria-hidden="true">{icon}</span>
                  <h2 className="h3" style={{ fontWeight: 800 }}>{t}</h2>
                  <p className="muted">{b}</p>
                  <a href={href} className="small" style={{ fontWeight: 700, alignSelf: 'flex-start', textDecoration: 'none', borderBottom: '2px solid currentColor' }}>{cta} →</a>
                </div>
              ))}
            </div>
            <div className="card card-deep" data-reveal="" style={{ gap: '1.5rem' }}>
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
