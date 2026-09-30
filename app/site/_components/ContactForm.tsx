'use client'
import { useState } from 'react'
import { AREAS, NIGHTS, TOPICS } from '@/lib/site/forms'

/**
 * Contact and volunteer form. Sends to /api/contact, which emails the club inbox with the
 * sender as reply-to. Consent is required before sending; nothing is kept on the site.
 */
export function ContactForm({ kind = 'contact' }: { kind?: 'contact' | 'volunteer' }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  const volunteer = kind === 'volunteer'

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setState('sending'); setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, name: f.get('name'), email: f.get('email'), topic: f.get('topic'), area: f.get('area'),
          nights: f.getAll('nights'), message: f.get('message'), consent: f.get('consent') === 'yes', website: f.get('website'),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Something went wrong. Please try again.'); setState('idle'); return }
      setState('sent')
    } catch {
      setError('No connection. Please try again.'); setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <div className="form-done" role="status">
        <span className="mark" aria-hidden="true">✓</span>
        <h2 className="h3" style={{ fontWeight: 800 }}>{volunteer ? 'Thanks for offering to help!' : 'Message sent'}</h2>
        <p style={{ color: 'var(--on-dark-2)' }}>
          {volunteer ? 'We’ll be in touch by email about the next steps.' : 'We’ll reply by email, usually within a few days.'}
        </p>
      </div>
    )
  }

  return (
    <form className="form" onSubmit={submit} noValidate={false}>
      <div className="form-2">
        <label className="field"><span>Your name</span>
          <input className="input" name="name" autoComplete="name" required maxLength={80} />
        </label>
        <label className="field"><span>Email</span>
          <input className="input" name="email" type="email" autoComplete="email" required maxLength={200} />
        </label>
      </div>

      {volunteer ? (
        <>
          <fieldset className="choices">
            <legend>Which nights could you help?</legend>
            {NIGHTS.map((n) => <label key={n} className="choice"><input type="checkbox" name="nights" value={n} />{n}</label>)}
          </fieldset>
          <label className="field"><span>Where in London?</span>
            <select className="input" name="area" defaultValue="West London">
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
        </>
      ) : (
        <label className="field"><span>What’s it about?</span>
          <select className="input" name="topic" defaultValue={TOPICS[0]}>
            {TOPICS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      )}

      <label className="field">
        <span>{volunteer ? <>Anything we should know? <span className="opt">(optional)</span></> : 'Message'}</span>
        <textarea className="input" name="message" required={!volunteer} maxLength={3000}
          placeholder={volunteer ? 'How long you’ve been playing with us, anything you’d like to help with…' : 'How can we help?'} />
      </label>

      {/* Hidden from people; bots that fill it in are ignored */}
      <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>

      <label className="consent">
        <input type="checkbox" name="consent" value="yes" required />
        <span>
          I agree to The Shuttle Social using these details to reply to me{volunteer ? ' about volunteering' : ''}.
          They’re sent to our email inbox and not added to any mailing list. <a href="/privacy">Privacy notice</a>
        </span>
      </label>

      {error && <p className="form-msg err" role="alert">{error}</p>}
      <button className="send" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : volunteer ? 'Send' : 'Send message'}
      </button>
    </form>
  )
}
