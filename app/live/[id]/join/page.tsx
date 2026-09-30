'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { T, inp, btn } from '@/app/_design/theme'
import { LEVEL_INFO } from '@/lib/live-session/levels'
import type { Level } from '@/lib/live-session/engine'
import { authHeader } from '@/lib/accountClient'

/**
 * Self-registration. One QR for the whole session lands here; the player types
 * their own name and picks their own level, rather than hunting for themselves
 * in a list the organiser typed out in advance.
 */
export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [step, setStep] = useState<'name' | 'level' | 'pin' | 'signin'>('name')
  const [pin, setPin] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [pinEntry, setPinEntry] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [level, setLevel] = useState<Level | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [closed, setClosed] = useState<string | null>(null)

  // Already registered on this phone? Straight through. The server cookie
  // first (survives this browser's storage being cleared), then this
  // browser's saved link.
  useEffect(() => {
    let off = false
    ;(async () => {
      const auth = await authHeader()
      try {
        const me = await fetch(`/api/live/${id}/me`, { cache: 'no-store', headers: auth }).then((r) => r.json())
        if (me.player_id) { remember(me.player_id); router.replace(`/live/${id}/player/${me.player_id}`); return }
      } catch { /* offline: fall through */ }
      // Signed in: fill in their name so joining is one tap on a level.
      if (auth.Authorization) {
        try {
          const acc = await fetch('/api/me', { cache: 'no-store', headers: auth }).then((r) => r.json())
          const full: string = acc.profile?.displayName ?? ''
          if (full && !off) {
            const [f, ...rest] = full.split(' ')
            setFirst(f); setLast(rest.join(' ')); setSignedIn(true)
          }
        } catch { /* ignore */ }
      }
      try {
        const saved = localStorage.getItem(`tss-live-player:${id}`)
        if (saved) { router.replace(`/live/${id}/player/${saved}`); return }
      } catch { /* private mode */ }
      // Say up front if registration is closed, rather than after they type.
      try {
        const j = await fetch(`/api/live/${id}`, { cache: 'no-store' }).then((r) => r.json())
        if (j.meta?.status === 'finished') setClosed('This session has finished.')
        else if (j.meta && !j.meta.registrationOpen) setClosed('Registration is closed. Ask the organiser to add you.')
      } catch { /* ignore */ }
      if (!off) setChecked(true)
    })()
    return () => { off = true }
  }, [id, router]) // eslint-disable-line react-hooks/exhaustive-deps

  const remember = (pid: string, p?: string | null) => {
    try {
      localStorage.setItem(`tss-live-player:${id}`, pid)
      if (p) localStorage.setItem(`tss-live-pin:${id}`, p)
    } catch { /* private mode */ }
  }

  const signIn = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/live/${id}/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${first.trim()} ${last.trim()}`.trim(), pin: pinEntry }) })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not sign in'); return }
      remember(json.player_id, pinEntry)
      router.push(`/live/${id}/player/${json.player_id}`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const submit = async (lv: Level) => {
    setBusy(true); setError(null)
    try {
      const name = `${first.trim()} ${last.trim()}`.trim()
      const res = await fetch(`/api/live/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ name, level: lv }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not join')
        setStep(json.alreadyRegistered ? 'signin' : 'name'); return
      }
      remember(json.player_id, json.pin)
      if (json.pin) { setPin(json.pin); setPlayerId(json.player_id); setStep('pin') }
      else router.push(`/live/${id}/player/${json.player_id}`)
    } catch (e) {
      setError((e as Error).message); setStep('name')
    } finally { setBusy(false) }
  }

  if (!checked) return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.muted, display:'grid',
      placeItems:'center', fontFamily:'inherit' }}>Loading…</div>
  )

  const wrap: React.CSSProperties = {
    minHeight:'100vh', background:T.bg, color:T.text, padding:'28px 20px',
    fontFamily:'inherit', boxSizing:'border-box',
    maxWidth:520, margin:'0 auto',
  }

  const errorBox = error && <div role="alert" style={{ background:T.dangerDim, border:`1px solid ${T.danger}`,
    color:T.danger, padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:14 }}>{error}</div>

  // Shown once, straight after registering.
  if (step === 'pin' && pin && playerId) return (
    <div style={{ ...wrap, textAlign:'center' }}>
      <div style={{ fontSize:12, color:T.muted, textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginTop:20 }}>You&apos;re in</div>
      <h1 style={{ fontSize:26, fontWeight:900, margin:'6px 0 18px' }}>Your PIN is</h1>
      <div aria-label={`Your PIN is ${pin.split('').join(' ')}`} style={{ fontSize:64, fontWeight:900, letterSpacing:'14px',
        fontVariantNumeric:'tabular-nums', color:T.accent, background:T.card, border:`1px solid ${T.accentBorder}`,
        borderRadius:16, padding:'18px 0 18px 14px', marginBottom:14 }}>{pin}</div>
      <p style={{ fontSize:17, fontWeight:700, margin:'0 0 8px' }}>📸 Screenshot this</p>
      <p style={{ color:T.muted, fontSize:14, lineHeight:1.5, margin:'0 0 24px' }}>
        This phone will remember you tonight. If you open the QR on another phone or browser, tap
        “Already registered?” and enter your name and this PIN to get back to your page.
      </p>
      <button style={{ ...btn('primary'), width:'100%', padding:'15px', fontSize:16 }}
        onClick={() => router.push(`/live/${id}/player/${playerId}`)}>
        I&apos;ve saved it — go to my page
      </button>
    </div>
  )

  if (step === 'signin') return (
    <div style={wrap}>
      <button onClick={() => { setStep('name'); setError(null) }} style={{ ...btn(), marginBottom:16, padding:'10px 14px', fontSize:14 }}>← Back</button>
      <h1 style={{ fontSize:30, fontWeight:900, margin:'0 0 6px' }}>Already registered?</h1>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>
        Enter your name as you registered it and the 4-digit PIN you were shown.
      </p>
      {errorBox}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        <input aria-label="First name" placeholder="First name" style={inp({ fontSize:17, padding:'14px' })} value={first}
          autoComplete="given-name" onChange={e => setFirst(e.target.value)} />
        <input aria-label="Last name" placeholder="Last name" style={inp({ fontSize:17, padding:'14px' })} value={last}
          autoComplete="family-name" onChange={e => setLast(e.target.value)} />
      </div>
      <input aria-label="PIN" placeholder="PIN" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="one-time-code"
        style={inp({ fontSize:28, padding:'14px', letterSpacing:'10px', textAlign:'center', marginBottom:18 })}
        value={pinEntry} onChange={e => setPinEntry(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={e => { if (e.key === 'Enter' && pinEntry.length === 4) signIn() }} />
      <button style={{ ...btn('primary'), width:'100%', padding:'15px', fontSize:16 }}
        disabled={busy || !first.trim() || pinEntry.length !== 4} onClick={signIn}>
        {busy ? 'Checking…' : 'Go to my page'}
      </button>
      <p style={{ color:T.muted, fontSize:13, marginTop:14, textAlign:'center', lineHeight:1.5 }}>
        No PIN? If the organiser added you, or you&apos;ve lost it, ask them — they can send you your link or a new PIN.
      </p>
    </div>
  )

  if (closed) return (
    <div style={{ ...wrap, display:'grid', placeItems:'center', textAlign:'center' }}>
      <div>
        <h1 style={{ fontSize:24, fontWeight:900, margin:'0 0 8px' }}>Can&apos;t register right now</h1>
        <p style={{ color:T.muted, fontSize:15, margin:0 }}>{closed}</p>
        <button onClick={() => { setClosed(null); setStep('signin') }}
          style={{ ...btn('primary'), width:'100%', padding:'14px', fontSize:15, marginTop:22 }}>
          Already registered? Get back to your page
        </button>
      </div>
    </div>
  )

  if (step === 'name') return (
    <div style={wrap}>
      <div style={{ fontSize:12, color:T.muted, textTransform:'uppercase',
        letterSpacing:'1px', fontWeight:600 }}>Live session</div>
      <h1 style={{ fontSize:32, fontWeight:900, margin:'4px 0 6px' }}>What&apos;s your name?</h1>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>
        This is how you&apos;ll appear on the court list. <a href="/privacy" style={{ color:T.muted }}>How we use it</a>
      </p>

      {errorBox}

      <label style={{ display:'block', marginBottom:14 }}>
        <span style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>First name</span>
        <input style={inp({ fontSize:17, padding:'14px 14px' })} value={first} autoComplete="given-name"
          onChange={e => setFirst(e.target.value)} />
      </label>
      <label style={{ display:'block', marginBottom:20 }}>
        <span style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>Last name</span>
        <input style={inp({ fontSize:17, padding:'14px 14px' })} value={last} autoComplete="family-name"
          onChange={e => setLast(e.target.value)} />
      </label>

      <button style={{ ...btn('primary'), width:'100%', padding:'15px', fontSize:16 }}
        disabled={!first.trim() || !last.trim()}
        onClick={() => setStep('level')}>
        Continue
      </button>
      {(!first.trim() || !last.trim()) && (
        <p style={{ color:T.muted, fontSize:13, marginTop:10, textAlign:'center' }}>
          Enter both names to continue
        </p>
      )}
      {!signedIn && (
        <>
          <button onClick={() => { setStep('signin'); setError(null) }}
            style={{ ...btn(), width:'100%', padding:'14px', fontSize:15, marginTop:18 }}>
            Already registered? Get back to your page
          </button>
          <p style={{ color:T.muted, fontSize:13, marginTop:14, textAlign:'center' }}>
            Have a TSS account? <a href={`/account?next=/live/${id}/join`} style={{ color:T.accent }}>Sign in</a> and you&apos;ll never need a PIN.
          </p>
        </>
      )}
    </div>
  )

  return (
    <div style={wrap}>
      <button onClick={() => setStep('name')} style={{ ...btn(), marginBottom:16, padding:'7px 12px', fontSize:13 }}>
        ← Back
      </button>
      <h1 style={{ fontSize:30, fontWeight:900, margin:'0 0 6px' }}>How would you rate yourself?</h1>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>
        Be honest — it only sets your starting point. After a couple of games your
        results decide where you play.
      </p>

      <div style={{ display:'grid', gap:12 }}>
        {LEVEL_INFO.map(l => (
          <button key={l.level} disabled={busy}
            onClick={() => { setLevel(l.level); submit(l.level) }}
            style={{
              textAlign:'left', background: level === l.level ? T.card2 : T.card,
              border:`1px solid ${level === l.level ? l.dot : T.border}`,
              borderRadius:14, padding:'16px 16px', cursor:'pointer',
              color:T.text, fontFamily:'inherit', width:'100%',
            }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
              <span style={{ width:12, height:12, borderRadius:'50%', background:l.dot, flexShrink:0 }} />
              <span style={{ fontSize:18, fontWeight:800 }}>{l.label}</span>
            </div>
            <div style={{ color:T.muted, fontSize:14, lineHeight:1.45 }}>{l.blurb}</div>
          </button>
        ))}
      </div>
      {busy && <p style={{ color:T.muted, fontSize:14, marginTop:14, textAlign:'center' }}>Joining…</p>}
    </div>
  )
}
