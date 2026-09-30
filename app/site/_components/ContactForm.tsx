'use client'
import { useState } from 'react'
import { AREAS, JOIN_INTERESTS, JOIN_QUESTIONS, SUGGESTION_TOPICS, TOPICS } from '@/lib/site/forms'
import { Icon } from './Icon'

type Kind = 'contact' | 'join' | 'suggestion'

const DONE: Record<Kind, [string, string]> = {
  contact: ['Message sent', 'We’ll reply by email, usually within a few days.'],
  join: ['Thanks for applying!', 'We read every application and will be in touch by email about next steps.'],
  suggestion: ['Thank you!', 'Every suggestion is read by the team. It really does shape the nights.'],
}

/**
 * The website's forms: contact, Join us (volunteering application) and suggestions.
 * Sends to /api/contact, which emails the club inbox. Nothing is kept on the site.
 * Contact and Join us need consent; suggestions can be anonymous, and only ask for
 * consent when someone leaves an email for a reply.
 */
export function ContactForm({ kind = 'contact' }: { kind?: Kind }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setState('sending'); setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, name: f.get('name'), email: f.get('email'), topic: f.get('topic'), area: f.get('area'),
          interests: f.getAll('interests'), other: f.get('other'),
          answers: JOIN_QUESTIONS.map((_, k) => f.get(`q${k}`)), message: f.get('message'),
          consent: f.get('consent') === 'yes', website: f.get('website'),
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
    const [t, b] = DONE[kind]
    return (
      <div className="form-done" role="status">
        <span className="mark"><Icon name="check" size={30} /></span>
        <h2 className="h3" style={{ fontWeight: 800 }}>{t}</h2>
        <p style={{ color: 'var(--on-dark-2)' }}>{b}</p>
      </div>
    )
  }

  const optional = kind === 'suggestion'
  const askConsent = kind !== 'suggestion' || email.trim() !== ''

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-2">
        <label className="field"><span>Your name{optional && <span className="opt"> (optional)</span>}</span>
          <input className="input" name="name" autoComplete="name" required={!optional} maxLength={80} />
        </label>
        <label className="field"><span>Email{optional && <span className="opt"> (optional, if you’d like a reply)</span>}</span>
          <input className="input" name="email" type="email" autoComplete="email" required={!optional} maxLength={200}
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>

      {kind === 'contact' && (
        <label className="field"><span>What’s it about?</span>
          <select className="input" name="topic" defaultValue={TOPICS[0]}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
      )}

      {kind === 'suggestion' && (
        <label className="field"><span>What’s it about?</span>
          <select className="input" name="topic" defaultValue={SUGGESTION_TOPICS[0]}>{SUGGESTION_TOPICS.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
      )}

      {kind === 'join' && (
        <>
          <fieldset className="choices">
            <legend>Which areas would you like to help with? <span className="req">*</span></legend>
            {JOIN_INTERESTS.map((a) => <label key={a} className="choice"><input type="checkbox" name="interests" value={a} />{a}</label>)}
          </fieldset>
          <div className="form-2">
            <label className="field"><span>Something else? <span className="opt">(optional)</span></span>
              <input className="input" name="other" maxLength={120} />
            </label>
            <label className="field"><span>Where in London?</span>
              <select className="input" name="area" defaultValue="West London">{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
            </label>
          </div>
          {JOIN_QUESTIONS.map((q, k) => (
            <label key={q} className="field"><span>{k + 1}. {q} <span className="req">*</span></span>
              <textarea className="input" name={`q${k}`} required minLength={10} maxLength={1500} style={{ minHeight: '6.5rem' }} />
            </label>
          ))}
        </>
      )}

      {kind !== 'join' && (
        <label className="field"><span>{kind === 'suggestion' ? 'Your suggestion' : 'Message'}</span>
          <textarea className="input" name="message" required maxLength={3000}
            placeholder={kind === 'suggestion' ? 'Something we could do better, something you’d love to see, anything…' : 'How can we help?'} />
        </label>
      )}

      {/* Hidden from people; bots that fill it in are ignored */}
      <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>

      {askConsent && (
        <label className="consent">
          <input type="checkbox" name="consent" value="yes" required />
          <span>
            I agree to The Shuttle Social using these details to {kind === 'join' ? 'consider my application and contact me about it' : 'reply to me'}.
            They’re sent to our email inbox and not added to any mailing list. <a href="/privacy">Privacy notice</a>
          </span>
        </label>
      )}

      {error && <p className="form-msg err" role="alert">{error}</p>}
      <button className="send" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : kind === 'join' ? 'Send application' : kind === 'suggestion' ? 'Send suggestion' : 'Send message'}
      </button>
    </form>
  )
}
