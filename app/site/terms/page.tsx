import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { PageHero, Ph, SiteFooter } from '../_components/SiteChrome'

// The same text players agree to before booking (Admin → Settings → Terms & Conditions).
export const revalidate = 300

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Booking terms for The Shuttle Social sessions: tickets, releasing your space, refunds and conduct.',
  alternates: { canonical: '/terms' },
}

export default async function TermsPage() {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', 'terms_and_conditions').maybeSingle()
  const text = (data?.value ?? '').trim()

  return (
    <>
      <PageHero current="/terms" kicker="Terms" title="Booking terms."
        lead="The terms you agree to when you book a session. See also our community guidelines and privacy notice." />

      <main id="main">
        <section className="sec" style={{ background: 'var(--s-week)' }} aria-label="Terms and conditions">
          <div className="wrap">
            <div className="card" style={{ maxWidth: '52rem' }}>
              {text
                ? <div className="terms-text">{text}</div>
                : <p><Ph>Your terms and conditions. Add them in Admin → Settings → Terms &amp; Conditions and they appear here and before booking</Ph></p>}
              <p className="muted small" style={{ marginTop: '1rem' }}>
                Also read our <a href="/community">community guidelines</a> and <a href="/privacy">privacy notice</a>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
