import type { Metadata } from 'next'
import { ContactForm } from '../_components/ContactForm'
import { FaqList } from '../_components/FaqList'
import { HowItWorks, type Step } from '../_components/HowItWorks'
import { Icon, type IconName } from '../_components/Icon'
import { RotatingWord } from '../_components/RotatingWord'
import { PageHero, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Join us',
  description: 'Help run The Shuttle Social: host sessions with a co-host, get free sessions, and grow into our core team. A volunteering role.',
  alternates: { canonical: '/join-us' },
}

const HOSTING: Step[] = [
  { title: 'Welcome everyone', body: 'Open the night: say hello, introduce the session and explain how it works.', kicker: 'Start of the night', big: 'Welcome in!', small: 'You set the tone for the whole night.' },
  { title: 'Look after new faces', body: 'Check in with anyone who’s new and have a chat, so nobody feels on their own.', kicker: 'First-timers', big: 'Say hello', small: 'The chatting and socialising part of the night.' },
  { title: 'Keep the night moving', body: 'Who’s on and off is worked out in real time and shows on everyone’s phone, so no more reading out numbers. You keep an eye on the courts.', kicker: 'Every round', big: 'Next round', small: 'Rotations update live for everyone.' },
  { title: 'Share it with a co-host', body: 'Two hosts run each session and split the playing time between them, so you both get to play.', kicker: 'Co-hosting', big: 'Tag team', small: 'Part of the night hosting, part on court.' },
]

const PERKS: [IconName, string, string, string][] = [
  ['gift', 'A free spot', 'For the session you host, with the playing time shared with your co-host.', 'c-lime'],
  ['ticket', 'Another free session', 'To use at any of our sessions, whenever you like.', 'c-mint'],
  ['clipboard', 'Full rundown', 'We take you through the whole night from A to Z before you start.', 'c-teal'],
  ['users', 'A trial session', 'Practise hosting with us there, so you feel fully confident.', 'c-sage'],
  ['star', 'A path to the core team', 'Hosts can go on to help shape TSS behind the scenes: events, social media, partnerships and more.', 'c-forest'],
]

const FAQ: [string, string][] = [
  ['Who are you looking for?', 'Friendly regulars who love the nights, know how a session runs, and enjoy chatting to new people. Confidence to speak to the room helps, and we’ll help you build it.'],
  ['How much time does it take?', 'You host one session at a time, with a co-host, on dates we agree together. Before your first, there’s a full rundown and a trial session with us.'],
  ['Do I need to be a great player?', 'No. Hosting is about people, not smashes. You still get to play, sharing the court time with your co-host.'],
  ['What is the core team?', 'The people who help run TSS behind the scenes: planning events, social media and content, partnerships, helping beginners and keeping things organised.'],
  ['What happens after I apply?', 'We read every application and reply by email. If it’s a good fit, we’ll chat about dates, then do the rundown and a trial session together.'],
]

export default function JoinUsPage() {
  return (
    <>
      <PageHero current="/join-us" kicker="Join us"
        srTitle="Help run the night."
        title={<>Help run <RotatingWord words={['the night.', 'the fun.', 'TSS.']} /></>}
        lead="A volunteering role hosting our sessions, with the chance to become part of our core team."
        chips={[<><Icon name="gift" size={18} />Free spot when you host</>, <>Co-host with <strong>a partner</strong></>, <><Icon name="clipboard" size={18} />Full training</>]}
        strip={{ label: 'Hosting at a glance', items: [['2', 'hosts every session'], ['1', 'free spot when you host'], ['+1', 'free session, any time'], ['A–Z', 'rundown before you start'], ['1', 'trial session with us']] }}>
        <a href="#apply" className="pill pill-cream">Apply now</a>
      </PageHero>

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-how)' }} aria-labelledby="host-h">
          <HowItWorks steps={HOSTING} title="What hosting looks like" headingId="host-h" intro="It’s the welcoming, chatting and socialising that make a TSS night." />
        </section>

        <section className="sec" style={{ background: 'var(--s-week)' }} aria-labelledby="get-h">
          <span className="decor decor-lime" data-parallax="0.35" aria-hidden="true" style={{ right: '6%', top: '10%', width: '8rem', height: '8rem' }} />
          <div className="wrap">
            <div className="head-row" data-reveal="">
              <h2 id="get-h" className="disp h2">What you get</h2>
              <p className="muted" style={{ maxWidth: '34ch' }}>This is a volunteering role. Here’s how we say thank you.</p>
            </div>
            <div className="cards" data-reveal-stagger="">
              {PERKS.map(([icon, t, b, c]) => (
                <div key={t} className={`card ${c}`} data-reveal="">
                  <span className="icon"><Icon name={icon} /></span>
                  <h3 className="h3" style={{ fontWeight: 800 }}>{t}</h3>
                  <p className="muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec faq-sec" aria-labelledby="jq-h">
          <span className="decor decor-lime" data-parallax="0.4" aria-hidden="true" style={{ right: '-10rem', top: '-6rem', width: '30rem', height: '30rem', opacity: 0.6 }} />
          <div className="wrap faq">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem', alignItems: 'flex-start' }}>
              <h2 id="jq-h" className="disp h2 faq-title">Good to know</h2>
              <p className="lead" style={{ color: 'var(--on-dark-2)', maxWidth: '24ch' }}>Still wondering? DM us on Instagram.</p>
            </div>
            <FaqList items={FAQ} />
          </div>
        </section>

        <section className="sec story-sec" id="apply" aria-labelledby="apply-h">
          <span className="decor decor-green" data-parallax="0.3" aria-hidden="true" style={{ left: '-6rem', top: '10%', width: '24rem', height: '24rem' }} />
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 id="apply-h" className="disp h2">Apply to join the team</h2>
              <p className="lead muted">Three short questions help us get to know you. There are no wrong answers: just be yourself.</p>
            </div>
            <div className="card card-deep static" data-reveal="" style={{ gap: '1.5rem' }}>
              <ContactForm kind="join" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
