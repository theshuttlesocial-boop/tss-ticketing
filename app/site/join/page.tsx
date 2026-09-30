import type { Metadata } from 'next'
import { CLUB_STATS } from '@/lib/site/stats'
import { FAQS } from '@/lib/site/faqs'
import { WELCOME_MESSAGE } from '@/lib/site/join'
import { FaqList } from '../_components/FaqList'
import { Icon } from '../_components/Icon'
import { JoinForm } from '../_components/JoinForm'
import { RotatingWord } from '../_components/RotatingWord'
import { PageHero, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Join our WhatsApp community',
  description: 'Join The Shuttle Social WhatsApp community: new sessions and ticket releases are shared there first.',
  alternates: { canonical: '/join' },
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const src = String((await searchParams).src ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || undefined
  const whatsapp = CLUB_STATS.whatsapp.toLocaleString('en-GB')
  return (
    <>
      <PageHero current="/join" kicker="WhatsApp community"
        srTitle="Join the community."
        title={<>Join the <RotatingWord words={['community.', 'group chat.', 'fun.']} /></>}
        lead={`${whatsapp}+ people get new sessions and ticket releases here first.`}
        chips={[<><Icon name="chat" size={18} />{whatsapp}+ members</>, <>Tickets <strong>first</strong></>, <><Icon name="megaphone" size={18} />New sessions</>]}>
        <a href="#join-form" className="pill pill-cream">Get the invite link</a>
      </PageHero>

      <main id="main">
        <section className="sec story-sec" aria-labelledby="welcome-h">
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <span className="kicker" style={{ color: 'var(--lime)' }}>Before you join</span>
              <h2 id="welcome-h" className="disp h2">A quick welcome</h2>
            </div>
            <div className="prose lead" data-reveal="">
              {WELCOME_MESSAGE.map((p) => <p key={p}>{p}</p>)}
            </div>
          </div>
        </section>

        <section className="sec faq-sec" aria-labelledby="faq-h">
          <div className="wrap faq">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem', alignItems: 'flex-start' }}>
              <h2 id="faq-h" className="disp h2 faq-title">FAQs</h2>
            </div>
            <FaqList items={FAQS.filter(([q]) => q !== 'How do I join?')} />
          </div>
        </section>

        <section className="sec" id="join-form" style={{ background: 'var(--s-real)' }} aria-labelledby="form-h">
          <div className="wrap split">
            <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 id="form-h" className="disp h2">Get the invite link</h2>
              <p className="lead muted">Tell us a little about you and the link appears straight away. We’ll email you a copy of the welcome message too.</p>
            </div>
            <div className="card card-deep static" data-reveal="" style={{ gap: '1.5rem' }}>
              <JoinForm src={src} />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
