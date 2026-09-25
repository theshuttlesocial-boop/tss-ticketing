'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { T, inp, btn } from '../../_components/theme'
import { LEVEL_INFO } from '@/lib/live-session/levels'
import type { Level } from '@/lib/live-session/engine'

/**
 * Self-registration. One QR for the whole session lands here; the player types
 * their own name and picks their own level, rather than hunting for themselves
 * in a list the organiser typed out in advance.
 */
export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [step, setStep] = useState<'name' | 'level'>('name')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [level, setLevel] = useState<Level | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [closed, setClosed] = useState<string | null>(null)

  // Already registered on this phone? Straight through.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`tss-live-player:${id}`)
      if (saved) { router.replace(`/live/${id}/player/${saved}`); return }
    } catch { /* private mode */ }
    // Say up front if registration is closed, rather than after they type.
    fetch(`/api/live/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.meta?.status === 'finished') setClosed('This session has finished.')
        else if (j.meta && !j.meta.registrationOpen) setClosed('Registration is closed. Ask the organiser to add you.')
      })
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [id, router])

  const submit = async (lv: Level) => {
    setBusy(true); setError(null)
    try {
      const name = `${first.trim()} ${last.trim()}`.trim()
      const res = await fetch(`/api/live/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, level: lv }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not join'); setStep('name'); return }
      try { localStorage.setItem(`tss-live-player:${id}`, json.player_id) } catch { /* ignore */ }
      router.push(`/live/${id}/player/${json.player_id}`)
    } catch (e) {
      setError((e as Error).message); setStep('name')
    } finally { setBusy(false) }
  }

  if (!checked) return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.muted, display:'grid',
      placeItems:'center', fontFamily:'DM Sans, system-ui, sans-serif' }}>Loading…</div>
  )

  const wrap: React.CSSProperties = {
    minHeight:'100vh', background:T.bg, color:T.text, padding:'28px 20px',
    fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box',
    maxWidth:520, margin:'0 auto',
  }

  if (closed) return (
    <div style={{ ...wrap, display:'grid', placeItems:'center', textAlign:'center' }}>
      <div>
        <h1 style={{ fontSize:24, fontWeight:900, margin:'0 0 8px' }}>Can&apos;t register right now</h1>
        <p style={{ color:T.muted, fontSize:15, margin:0 }}>{closed}</p>
      </div>
    </div>
  )

  if (step === 'name') return (
    <div style={wrap}>
      <div style={{ fontSize:12, color:T.muted, textTransform:'uppercase',
        letterSpacing:'1px', fontWeight:600 }}>Live session</div>
      <h1 style={{ fontSize:32, fontWeight:900, margin:'4px 0 6px' }}>What&apos;s your name?</h1>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>
        This is how you&apos;ll appear on the court list.
      </p>

      {error && <div style={{ background:T.dangerDim, border:`1px solid ${T.danger}`,
        color:T.danger, padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:14 }}>{error}</div>}

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
