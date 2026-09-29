'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { authHeader } from '@/lib/accountClient'
import { T, inp, btn, cardStyle } from '../live/_components/theme'
import { LEVEL_INFO } from '@/lib/live-session/levels'

type Me = {
  profile: { email: string; firstName: string | null; displayName: string | null; level: string | null }
  sessions: {
    upcoming: { ref: string; quantity: number; title: string; venue: string; date: string; time: string; mapsUrl: string | null; cancelled: boolean }[]
    past: { ref: string; title: string; venue: string; date: string }[]
    live: { sessionId: string; playerId: string; name: string; status: string; date: string }[]
  }
}

const wrap: React.CSSProperties = { minHeight:'100vh', background:T.bg, color:T.text, padding:'28px 18px 48px',
  fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box', maxWidth:560, margin:'0 auto' }
const day = (d: string) => new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })

export default function AccountPage() {
  return <Suspense><Account /></Suspense>
}

/**
 * Sign in with an emailed sign-in code (no password), then "My sessions":
 * upcoming bookings, past bookings and live sessions played. Bookings made
 * with the same email before the account existed appear automatically.
 */
function Account() {
  const next = useSearchParams().get('next')
  const [state, setState] = useState<'loading' | 'email' | 'code' | 'in'>('loading')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/me', { cache:'no-store', headers: await authHeader() })
    if (!res.ok) { setState('email'); return }
    setMe(await res.json()); setState('in')
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) load(); else setState('email') })
  }, [load])

  const sendCode = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) { setError(error.message.includes('rate') ? 'Too many codes requested. Wait a minute and try again.' : error.message); return }
    setState('code')
  }
  const verify = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) { setError('That code is wrong or has expired. Check the latest email, or send a new code.'); return }
    if (next && next.startsWith('/')) { window.location.href = next; return }
    await load()
  }
  const signOut = async () => { await supabase.auth.signOut(); setMe(null); setCode(''); setState('email') }

  if (state === 'loading') return <div style={{ ...wrap, color:T.muted }}>Loading…</div>

  const err = error && <div role="alert" style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, color:T.danger,
    padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:14 }}>{error}</div>

  if (state === 'email' || state === 'code') return (
    <div style={wrap}>
      <a href="/tickets" style={{ color:T.muted, fontSize:14, textDecoration:'none' }}>← Sessions</a>
      <h1 style={{ fontSize:30, fontWeight:900, margin:'14px 0 6px' }}>Your TSS account</h1>
      <p style={{ color:T.muted, fontSize:14, lineHeight:1.5, margin:'0 0 20px' }}>
        Use the email you book with — your bookings appear straight away. We&apos;ll email you a sign-in code; there&apos;s no password.
        We use your email only to sign you in and show your bookings.
      </p>
      {err}
      {state === 'email' ? (
        <>
          <input aria-label="Email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
            style={inp({ fontSize:17, padding:'14px', marginBottom:14 })} value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && email.includes('@')) sendCode() }} />
          <button style={{ ...btn('primary'), width:'100%', padding:15, fontSize:16 }} disabled={busy || !email.includes('@')} onClick={sendCode}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize:15, margin:'0 0 12px' }}>We sent a code to <strong>{email}</strong>. It can take a minute; check spam too.</p>
          <input aria-label="Code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code" maxLength={10}
            style={inp({ fontSize:28, padding:'14px', letterSpacing:'10px', textAlign:'center', marginBottom:14 })}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 6) verify() }} />
          <button style={{ ...btn('primary'), width:'100%', padding:15, fontSize:16 }} disabled={busy || code.length < 6} onClick={verify}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button style={{ ...btn(), width:'100%', padding:13, marginTop:10 }} disabled={busy} onClick={() => { setState('email'); setCode('') }}>
            Use a different email / send a new code
          </button>
        </>
      )}
    </div>
  )

  const s = me!.sessions
  return (
    <div style={wrap}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <a href="/tickets" style={{ color:T.muted, fontSize:14, textDecoration:'none' }}>← Sessions</a>
        <button style={{ ...btn(), padding:'8px 12px', fontSize:13 }} onClick={signOut}>Sign out</button>
      </div>
      <h1 style={{ fontSize:30, fontWeight:900, margin:'14px 0 2px' }}>
        {me!.profile.firstName ? `Hi ${me!.profile.firstName}` : 'My sessions'}
      </h1>
      <p style={{ color:T.muted, fontSize:13, margin:'0 0 18px' }}>{me!.profile.email}</p>

      {!me!.profile.displayName && <Profile onSaved={load} />}

      <Section title="Upcoming">
        {s.upcoming.length === 0 ? <Empty>No upcoming bookings. <a href="/tickets" style={{ color:T.accent }}>Book a session</a></Empty>
          : s.upcoming.map((b) => (
            <Row key={b.ref} title={`${day(b.date)} · ${b.time}`} sub={`${b.title} · ${b.venue}${b.quantity > 1 ? ` · ${b.quantity} spaces` : ''}`}
              right={b.cancelled ? <span style={{ color:T.danger, fontSize:12 }}>Cancelled</span> : <span style={{ color:T.muted, fontSize:12 }}>{b.ref}</span>}
              link={b.mapsUrl ?? undefined} linkLabel="Map" />
          ))}
      </Section>

      <Section title="Live sessions you played">
        {s.live.length === 0 ? <Empty>Sessions you join while signed in appear here.</Empty>
          : s.live.map((l) => (
            <Row key={l.playerId} title={l.name ?? 'Session'} sub={day(l.date.slice(0, 10)) + (l.status === 'live' ? ' · on now' : '')}
              link={`/live/${l.sessionId}/player/${l.playerId}`} linkLabel="Open" />
          ))}
      </Section>

      {s.past.length > 0 && (
        <Section title="Past bookings">
          {s.past.slice(0, 20).map((b) => <Row key={b.ref} title={day(b.date)} sub={`${b.title} · ${b.venue}`} />)}
        </Section>
      )}

      {me!.profile.displayName && <Profile onSaved={load} name={me!.profile.displayName} level={me!.profile.level} compact />}
    </div>
  )
}

function Profile({ onSaved, name, level, compact }: { onSaved: () => void; name?: string; level?: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(!compact)
  const [first, setFirst] = useState(name?.split(' ')[0] ?? '')
  const [last, setLast] = useState(name?.split(' ').slice(1).join(' ') ?? '')
  const [lvl, setLvl] = useState(level ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    await fetch('/api/me', { method:'PATCH', headers: { 'Content-Type':'application/json', ...(await authHeader()) },
      body: JSON.stringify({ firstName: first, lastName: last, ...(lvl ? { level: lvl } : {}) }) })
    setBusy(false); setOpen(false); onSaved()
  }
  if (!open) return <button style={{ ...btn(), width:'100%', marginTop:8, minHeight:44 }} onClick={() => setOpen(true)}>Edit my name and level</button>
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <h2 style={{ fontSize:15, margin:'0 0 4px' }}>Your name</h2>
      <p style={{ color:T.muted, fontSize:12, margin:'0 0 10px' }}>Other players see your first name and last initial.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
        <input aria-label="First name" placeholder="First name" style={inp({ fontSize:16 })} value={first} onChange={(e) => setFirst(e.target.value)} />
        <input aria-label="Last name" placeholder="Last name" style={inp({ fontSize:16 })} value={last} onChange={(e) => setLast(e.target.value)} />
      </div>
      <select aria-label="Your level" value={lvl} onChange={(e) => setLvl(e.target.value)} style={inp({ fontSize:16, marginBottom:10 })}>
        <option value="">Your level (optional)</option>
        {LEVEL_INFO.map((l) => <option key={l.level} value={l.level}>{l.label}</option>)}
      </select>
      <button style={{ ...btn('primary'), width:'100%', minHeight:44 }} disabled={busy || !first.trim()} onClick={save}>Save</button>
    </section>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section style={{ marginBottom:18 }}>
    <h2 style={{ fontSize:12, fontWeight:800, letterSpacing:'1px', textTransform:'uppercase', color:T.muted, margin:'0 0 8px' }}>{title}</h2>
    <div style={{ display:'grid', gap:8 }}>{children}</div>
  </section>
)
const Empty = ({ children }: { children: React.ReactNode }) => <div style={{ color:T.muted, fontSize:14 }}>{children}</div>
const Row = ({ title, sub, right, link, linkLabel }: { title: string; sub: string; right?: React.ReactNode; link?: string; linkLabel?: string }) => (
  <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontWeight:700, fontSize:15 }}>{title}</div>
      <div style={{ color:T.muted, fontSize:13, marginTop:2 }}>{sub}</div>
    </div>
    {right}
    {link && <a href={link} style={{ ...btn(), textDecoration:'none', padding:'9px 12px', fontSize:13 }}>{linkLabel}</a>}
  </div>
)
