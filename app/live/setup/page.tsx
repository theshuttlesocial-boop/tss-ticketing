'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { T, inp, cardStyle, btn } from '../_components/theme'

/**
 * Roster entry. Replaces having to POST /api/live by hand.
 * Any roster size works — the engine fills 4 courts and rotates the rest
 * through sit-outs, keeping sit-out counts within one of each other.
 */
const EXAMPLE = `Saranya, standard
Arjun, strong
Priya, beginner
Daniel, standard`

export default function LiveSetupPage() {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [name, setName] = useState('')
  const [courts, setCourts] = useState('4')
  const [seed, setSeed] = useState('1')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const s = sessionStorage.getItem('tss-admin-secret')
    if (s) { setSecret(s); setAuthed(true) }
  }, [])

  const parsed = useMemo(() => {
    const rows: { name: string; level: string; bad?: string }[] = []
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const [n, lvlRaw] = line.split(',').map(x => x?.trim())
      const lvl = (lvlRaw || 'standard').toLowerCase()
      rows.push({
        name: n,
        level: lvl,
        bad: !n ? 'missing name'
          : !['beginner','standard','intermediate','strong'].includes(lvl) ? `unknown level "${lvlRaw}"`
          : undefined,
      })
    }
    return rows
  }, [text])

  const errors = parsed.filter(p => p.bad)
  const dupes = parsed
    .map(p => p.name?.toLowerCase())
    .filter((n, i, a) => n && a.indexOf(n) !== i)
  const nCourts = Number(courts) || 4
  const playing = nCourts * 4
  const sitting = Math.max(0, parsed.length - playing)
  // Every reason the button is disabled, so it is never dead with no message.
  const blockers: string[] = []
  if (!name.trim()) blockers.push('Give the session a name')
  if (parsed.length === 0) blockers.push('Add your players')
  else if (parsed.length < 4) blockers.push(`Add at least 4 players (you have ${parsed.length})`)
  if (errors.length > 0) blockers.push(`Fix ${errors.length} bad line${errors.length > 1 ? 's' : ''}`)
  if (dupes.length > 0) blockers.push(`Make duplicate names unique: ${[...new Set(dupes)].join(', ')}`)
  const canSubmit = blockers.length === 0

  const create = async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({
          name: name.trim(),
          seed: Number(seed) || 1,
          courts: nCourts,
          roster: parsed.map(p => ({ name: p.name, level: p.level })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setMsg(json.error ?? 'Could not create session'); return }
      router.push(`/live/${json.id}/admin`)
    } catch (e) {
      setMsg((e as Error).message)
    } finally { setBusy(false) }
  }

  if (!authed) return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'grid', placeItems:'center',
      fontFamily:'DM Sans, system-ui, sans-serif' }}>
      <div style={{ ...cardStyle, padding:24, width:320 }}>
        <h1 style={{ color:T.text, fontSize:20, margin:'0 0 14px' }}>New live session</h1>
        <input type="password" placeholder="Admin secret" style={inp()} value={secret}
          onChange={e => setSecret(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && secret) { sessionStorage.setItem('tss-admin-secret', secret); setAuthed(true) } }} />
        <button style={{ ...btn('primary'), width:'100%', marginTop:12 }}
          onClick={() => { if (secret) { sessionStorage.setItem('tss-admin-secret', secret); setAuthed(true) } }}>
          Unlock
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, padding:'26px 20px',
      fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box', maxWidth:760, margin:'0 auto' }}>
      <h1 style={{ fontSize:26, fontWeight:900, margin:'0 0 4px' }}>New live session</h1>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 18px' }}>
        One player per line: <code>Name, level</code>. Level is beginner, standard, intermediate or strong,
        and defaults to standard if you leave it off.
      </p>

      {msg && <div style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, color:T.danger,
        padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:14 }}>{msg}</div>}

      <section style={{ ...cardStyle, padding:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:14 }}>
          <label><span style={{ fontSize:11, color:T.muted, display:'block', marginBottom:4 }}>
              Session name {!name.trim() && <span style={{ color:T.warning }}>· required</span>}
            </span>
            <input style={inp(!name.trim() ? { borderColor: T.warning } : undefined)}
              value={name} onChange={e => setName(e.target.value)} placeholder="Thursday Harrow" /></label>
          <label><span style={{ fontSize:11, color:T.muted, display:'block', marginBottom:4 }}>Courts</span>
            <input style={inp()} inputMode="numeric" value={courts} onChange={e => setCourts(e.target.value)} /></label>
          <label><span style={{ fontSize:11, color:T.muted, display:'block', marginBottom:4 }}>Seed</span>
            <input style={inp()} inputMode="numeric" value={seed} onChange={e => setSeed(e.target.value)} /></label>
        </div>

        <textarea style={inp({ minHeight:260, fontFamily:'ui-monospace, monospace', fontSize:13, lineHeight:1.6 })}
          value={text} onChange={e => setText(e.target.value)} placeholder={EXAMPLE} />

        <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'center', marginTop:12, fontSize:13 }}>
          <span><strong style={{ fontSize:20 }}>{parsed.length}</strong> <span style={{ color:T.muted }}>players</span></span>
          <span style={{ color:T.muted }}>{playing} on court · {sitting} sitting each round</span>
          {parsed.length > 0 && parsed.length < 4 &&
            <span style={{ color:T.warning }}>Need at least 4</span>}
          {sitting > 0 && parsed.length >= 4 &&
            <span style={{ color:T.muted }}>≈{Math.round(sitting / parsed.length * 100)}% resting</span>}
        </div>

        {(errors.length > 0 || dupes.length > 0) && (
          <div style={{ marginTop:10, fontSize:13, color:T.danger }}>
            {errors.slice(0,4).map((e,i) => <div key={i}>Line “{e.name || '(blank)'}”: {e.bad}</div>)}
            {dupes.length > 0 && <div>Duplicate name: {[...new Set(dupes)].join(', ')}</div>}
          </div>
        )}

        <div style={{ display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', marginTop:14 }}>
          <button style={btn('primary')} disabled={!canSubmit || busy} onClick={create}>
            {busy ? 'Creating…' : `Create session with ${parsed.length} players`}
          </button>
          {blockers.length > 0 && (
            <div style={{ fontSize:13, color:T.warning }}>
              {blockers.map((b, i) => <div key={i}>• {b}</div>)}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
