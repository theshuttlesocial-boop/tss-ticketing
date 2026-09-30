import type { Metadata } from 'next'
import { ContactForm } from '../_components/ContactForm'
import { PageHero, Ph, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Volunteer',
  description: 'Help run The Shuttle Social: become a session lead and help nights run smoothly.',
  alternates: { canonical: '/volunteer' },
}

// What a session lead does on the night (what the lead screens are built for).
const TASKS = [
  ['📋', 'Welcome and check-in', 'Greet players at the door and check them in on your phone.'],
  ['📱', 'Run the courts', 'Start the live session, keep the rounds moving and fix any scores or names.'],
  ['🏆', 'Host the grand final', 'Wrap up the night and make sure everyone had a good time.'],
]

export default function VolunteerPage() {
  return (
    <>
      <PageHero current="/volunteer" kicker="Volunteer" title="Help run the night."
        lead="Our session leads keep things friendly and moving. If you love the nights, come and help make them happen." />

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="do-h">
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="do-h" className="disp h2">What you’d do</h2>
            </div>
            <div className="cards" data-reveal-stagger="">
              {TASKS.map(([icon, t, b]) => (
                <div key={t} className="card" data-reveal="">
                  <span className="icon" aria-hidden="true">{icon}</span>
                  <h3 className="h3" style={{ fontWeight: 800 }}>{t}</h3>
                  <p className="muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" style={{ background: 'var(--s-how)' }} aria-labelledby="who-h">
          <div className="wrap split">
            <div className="prose" data-reveal="">
              <h2 id="who-h" className="disp h2">Who we’re looking for</h2>
              <p className="lead"><Ph>Who makes a good session lead, e.g. regulars who know the format and like meeting new people</Ph></p>
              <h2>What you get</h2>
              <p className="lead"><Ph>What volunteers get in return, e.g. free sessions, kit, or first access to tickets</Ph></p>
              <h2>How much time</h2>
              <p className="lead"><Ph>How often and how long, e.g. one night a month, arriving 20 minutes early</Ph></p>
            </div>
            <div className="card card-deep" data-reveal="" style={{ gap: '1.5rem' }}>
              <h2 className="disp" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', color: 'var(--lime)' }}>Put your name down</h2>
              <ContactForm kind="volunteer" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
