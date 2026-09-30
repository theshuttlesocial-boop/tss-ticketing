'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { authHeader } from '@/lib/accountClient'
import { T, inp, btn, cardStyle } from '@/app/_design/theme'
import { LEVEL_INFO } from '@/lib/live-session/levels'
import { InstallApp } from '../_components/InstallApp'

type Me = {
  profile: { email: string; firstName: string | null; displayName: string | null; level: string | null; leaderboard: boolean }
  sessions: {
    upcoming: { ref: string; quantity: number; title: string; venue: string; date: string; time: string; mapsUrl: string | null; cancelled: boolean }[]
    past: { ref: string; title: string; venue: string; date: string }[]
    live: { sessionId: string; playerId: string; name: string; status: string; date: string }[]
  }
}

const wrap: React.CSSProperties = { color:T.text, padding:'28px 18px 48px',
  fontFamily:'inherit', boxSizing:'border-box', maxWidth:560, margin:'0 auto' }
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
    padding:'10px 14px', borderRadius:14, marginBottom:14, fontSize:14 }}>{error}</div>

  if (state === 'email' || state === 'code') return (
    <div style={wrap}>
      <a href="/tickets" style={{ color:T.muted, fontSize:14, textDecoration:'none' }}>← Sessions</a>
      <h1 style={{ fontSize:36, fontWeight:900, letterSpacing:'-0.03em', margin:'14px 0 6px' }}>My portal</h1>
      <p style={{ color:T.muted, fontSize:14, lineHeight:1.5, margin:'0 0 20px' }}>
        Use the email you book with — your bookings appear straight away. We&apos;ll email you a sign-in code; there&apos;s no password.
        We use your email only to sign you in and show your bookings (<a href="/privacy" style={{ color:T.accent }}>privacy</a>).
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
      <h1 style={{ fontSize:36, fontWeight:900, letterSpacing:'-0.03em', margin:'14px 0 2px' }}>
        {me!.profile.firstName ? `Hi ${me!.profile.firstName}` : 'My sessions'}
      </h1>
      <p style={{ color:T.muted, fontSize:13, margin:'0 0 18px' }}>{me!.profile.email}</p>
      <InstallApp />

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

      <a href="/account/history" style={{ ...btn('primary'), display:'block', textAlign:'center', textDecoration:'none', padding:14, fontSize:15, marginBottom:10 }}>
        My games, head-to-head &amp; best partners →
      </a>
      <LeaderboardToggle on={me!.profile.leaderboard} onSaved={load} />

      {me!.profile.displayName && <Profile onSaved={load} name={me!.profile.displayName} level={me!.profile.level} compact />}

      <YourData onDeleted={async () => { await supabase.auth.signOut(); window.location.href = '/tickets?account=deleted' }} />
    </div>
  )
}

/** Download my data / Delete my account (UK GDPR access and erasure). */
function YourData({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const download = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/me/export', { headers: await authHeader() })
      if (!res.ok) throw new Error('Could not prepare your data')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a'); a.href = url; a.download = `tss-my-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click(); URL.revokeObjectURL(url)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true); setErr(null)
    const res = await fetch('/api/me', { method:'DELETE', headers: { 'Content-Type':'application/json', ...(await authHeader()) },
      body: JSON.stringify({ confirm: typed }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(j.error ?? 'Could not delete your account'); return }
    onDeleted()
  }
  return (
    <section style={{ marginTop:26, borderTop:`1px solid ${T.border}`, paddingTop:16 }}>
      <h2 style={{ fontSize:12, fontWeight:800, letterSpacing:'1px', textTransform:'uppercase', color:T.muted, margin:'0 0 8px' }}>Your data</h2>
      <p style={{ color:T.muted, fontSize:13, margin:'0 0 10px' }}>
        How we use it: <a href="/privacy" style={{ color:T.accent }}>privacy notice</a>.
      </p>
      {err && <div role="alert" style={{ color:T.danger, fontSize:14, marginBottom:8 }}>{err}</div>}
      <div style={{ display:'grid', gap:8 }}>
        <button style={{ ...btn(), minHeight:44 }} disabled={busy} onClick={download}>Download my data</button>
        {!confirming ? (
          <button style={{ ...btn('danger'), minHeight:44 }} onClick={() => setConfirming(true)}>Delete my account</button>
        ) : (
          <div style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, borderRadius:18, padding:14 }}>
            <p style={{ fontSize:14, margin:'0 0 8px', lineHeight:1.5 }}>
              This deletes your account and sign-in straight away. In past sessions you&apos;ll show as &ldquo;Former player&rdquo;,
              so other people&apos;s results stay correct. Your bookings and payment records are kept for 6 years, as the law requires.
              This can&apos;t be undone.
            </p>
            <input aria-label="Type DELETE to confirm" placeholder="Type DELETE" value={typed} onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters" style={inp({ fontSize:16, marginBottom:8 })} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <button style={{ ...btn(), minHeight:44 }} onClick={() => { setConfirming(false); setTyped('') }}>Cancel</button>
              <button style={{ ...btn('danger'), minHeight:44 }} disabled={busy || typed !== 'DELETE'} onClick={remove}>Delete for good</button>
            </div>
          </div>
        )}
      </div>
    </section>
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

/** Explicit opt-in to the public leaderboard. Off unless the player turns it on. */
function LeaderboardToggle({ on, onSaved }: { on: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const set = async (v: boolean) => {
    setBusy(true)
    await fetch('/api/me', { method:'PATCH', headers: { 'Content-Type':'application/json', ...(await authHeader()) }, body: JSON.stringify({ leaderboard: v }) })
    setBusy(false); onSaved()
  }
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <label style={{ display:'flex', gap:12, alignItems:'flex-start', cursor:'pointer' }}>
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => set(e.target.checked)} style={{ width:22, height:22, marginTop:2, accentColor:'var(--accent)' }} />
        <span>
          <strong style={{ fontSize:15 }}>Show me on the public <a href="/leaderboard" style={{ color:T.accent }}>leaderboard</a></strong>
          <span style={{ display:'block', color:T.muted, fontSize:13, marginTop:3, lineHeight:1.45 }}>
            Your first name, last initial and rating. You&apos;ll also see the ratings of other players who&apos;ve turned this on.
            Off by default; turn it off any time.
          </span>
        </span>
      </label>
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
  <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontWeight:700, fontSize:15 }}>{title}</div>
      <div style={{ color:T.muted, fontSize:13, marginTop:2 }}>{sub}</div>
    </div>
    {right}
    {link && <a href={link} style={{ ...btn(), textDecoration:'none', padding:'9px 12px', fontSize:13 }}>{linkLabel}</a>}
  </div>
)
