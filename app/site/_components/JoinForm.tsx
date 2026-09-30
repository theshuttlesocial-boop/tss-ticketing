'use client'
import { useState } from 'react'
import { HEARD_FROM } from '@/lib/site/join'
import { Icon } from './Icon'

type Result = { inviteUrl: string; code?: string; discount?: string }

/**
 * /join: first name, email, how they heard about us and consent. Sends to /api/join,
 * which emails a copy of the welcome message, then shows the WhatsApp invite link.
 */
export function JoinForm({ src }: { src?: string }) {
  const [state, setState] = useState<'idle' | 'sending'>('idle')
  const [error, setError] = useState('')
  const [done, setDone] = useState<Result | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setState('sending'); setError('')
    try {
      const res = await fetch('/api/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: f.get('firstName'), email: f.get('email'), heardFrom: f.get('heardFrom'), consent: f.get('consent') === 'yes', website: f.get('website'), src }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Something went wrong. Please try again.'); setState('idle'); return }
      setDone(d)
    } catch {
      setError('No connection. Please try again.'); setState('idle')
    }
  }

  if (done) {
    return (
      <div className="form-done" role="status">
        <span className="mark"><Icon name="check" size={30} /></span>
        <h2 className="h3" style={{ fontWeight: 800 }}>You’re nearly in!</h2>
        <p style={{ color: 'var(--on-dark-2)' }}>We’ve emailed you a copy of the welcome message. Tap below to join the community.</p>
        {done.inviteUrl
          ? <a href={done.inviteUrl} className="book" rel="noopener">Join the WhatsApp community<span className="book-arrow" aria-hidden="true"><Icon name="chat" size={16} /></span></a>
          : <p className="form-msg err">The invite link isn’t available right now. We’ll send it to you by email.</p>}
        {done.code && (
          <p style={{ color: 'var(--on-dark-2)' }}>
            New to our sessions? Use <strong style={{ color: 'var(--lime)' }}>{done.code}</strong> for {done.discount} off your first booking. <a href="/welcome" style={{ color: 'var(--lime)' }}>Find out more</a>
          </p>
        )}
      </div>
    )
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-2">
        <label className="field"><span>First name</span>
          <input className="input" name="firstName" autoComplete="given-name" required maxLength={40} />
        </label>
        <label className="field"><span>Email</span>
          <input className="input" name="email" type="email" autoComplete="email" required maxLength={200} />
        </label>
      </div>
      <label className="field"><span>How did you hear about us?</span>
        <select className="input" name="heardFrom" defaultValue={HEARD_FROM[0]}>{HEARD_FROM.map((h) => <option key={h}>{h}</option>)}</select>
      </label>

      <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>

      <label className="consent">
        <input type="checkbox" name="consent" value="yes" required />
        <span>
          I agree to The Shuttle Social emailing me a copy of this welcome message and keeping these details for up to 12 months,
          to see how people find us. No mailing list. <a href="/privacy">Privacy notice</a>
        </span>
      </label>

      {error && <p className="form-msg err" role="alert">{error}</p>}
      <button className="send" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Show me the invite link'}</button>
    </form>
  )
}
