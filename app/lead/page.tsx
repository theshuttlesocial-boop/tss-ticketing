'use client'
import { RequireTwoStep } from '@/app/_components/TwoStep'
import { useCallback, useEffect, useState } from 'react'
import { T, btn, cardStyle, inp } from '@/app/_design/theme'
import { LEVEL_INFO } from '@/lib/live-session/levels'
import { staffHeaders, whoAmI, signOutStaff } from '@/lib/staffClient'

type Console = {
  role: string
  canCreateLive: boolean
  sessions: { id: string; title: string; venue: string; date: string; time: string; capacity: number; booked: number
    attendanceReady: boolean; hasLiveSession: boolean
    attendees: { id: string; name: string; email: string | null; booked: boolean | null }[] }[]
  live: { id: string; name: string; status: string }[]
}

const wrap: React.CSSProperties = { minHeight:'100vh', background:T.bg, color:T.text, padding:'20px 16px 48px',
  fontFamily:'inherit', boxSizing:'border-box', maxWidth:560, margin:'0 auto' }

/**
 * Session lead console (Roadmap Phase 5b). Only what running the night needs:
 * who attended (everyone registered in tonight's live session, plus anyone a
 * lead adds), and a way into tonight's live session and timer. Nothing about payments, emails or other sessions. The server decides
 * what's shown (lib/lead.ts); hiding things here is not the protection.
 */
function LeadPageInner() {
  const [who, setWho] = useState<{ email: string | null; role: string } | null | undefined>(undefined)
  const [data, setData] = useState<Console | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // "Add a player" form, open for one session at a time.
  const [adding, setAdding] = useState<string | null>(null)
  const [form, setForm] = useState({ first: '', last: '', level: 'standard', email: '' })

  const load = useCallback(async () => {
    const res = await fetch('/api/lead', { cache:'no-store', headers: staffHeaders() })
    if (res.ok) setData(await res.json()); else setErr('Could not load your session')
  }, [])

  useEffect(() => { whoAmI().then((w) => { setWho(w); if (w) load() }) }, [load])
  useEffect(() => { if (!who) return; const t = setInterval(load, 20000); return () => clearInterval(t) }, [who, load])

  const addAttendee = async (ticketSessionId: string) => {
    setBusy(ticketSessionId); setErr(null)
    const res = await fetch('/api/lead/attendee', { method:'POST', headers: { 'Content-Type':'application/json', ...staffHeaders() },
      body: JSON.stringify({ ticket_session_id: ticketSessionId, ...form }) })
    if (res.ok) { setAdding(null); setForm({ first: '', last: '', level: 'standard', email: '' }) }
    else setErr((await res.json().catch(() => ({}))).error ?? 'Could not add them')
    await load(); setBusy(null)
  }

  if (who === undefined) return <div style={{ ...wrap, color:T.muted }}>Loading…</div>
  if (!who) return (
    <div style={{ ...wrap, display:'grid', placeItems:'center', textAlign:'center' }}>
      <div>
        <h1 style={{ fontSize:24, fontWeight:900, margin:'0 0 8px' }}>Session lead</h1>
        <p style={{ color:T.muted, margin:'0 0 18px' }}>Sign in with the email the organiser added you with.</p>
        <a href="/account?next=/lead" style={{ ...btn('primary'), display:'block', padding:14, fontSize:16, textDecoration:'none' }}>Sign in</a>
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:12, color:T.muted, textTransform:'uppercase', letterSpacing:'1px', fontWeight:700 }}>
            {who.role === 'session_lead' ? 'Session lead' : who.role === 'owner' ? 'Owner' : 'Admin'}
          </div>
          <div style={{ fontSize:13, color:T.muted }}>{who.email}</div>
        </div>
        <button style={{ ...btn(), minHeight:40 }} onClick={async () => { await signOutStaff(); location.reload() }}>Sign out</button>
      </div>
      {err && <div role="alert" style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, color:T.danger, padding:'10px 12px', borderRadius:8, marginBottom:12 }}>{err}</div>}

      {data && data.sessions.length === 0 && data.live.length === 0 && (
        <p style={{ color:T.muted, fontSize:15, lineHeight:1.5 }}>
          Nothing assigned to you right now. Your session appears here on the day, from a few hours before it starts.
        </p>
      )}

      {/* Tonight's live session(s) */}
      {data && (data.live.length > 0 || data.canCreateLive) && (
        <section style={{ ...cardStyle, padding:14 }}>
          <h2 style={{ fontSize:13, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'1px', color:T.muted }}>Live session</h2>
          <div style={{ display:'grid', gap:8 }}>
            {data.live.map((l) => (
              <div key={l.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center' }}>
                <div><strong>{l.name}</strong><div style={{ fontSize:12, color:T.muted }}>{l.status === 'setup' ? 'Registering' : l.status === 'live' ? 'Running' : 'Finished'}</div></div>
                <a href={`/live/${l.id}/admin`} style={{ ...btn('primary'), textDecoration:'none', minHeight:44, display:'grid', placeItems:'center' }}>Run it · timer</a>
                <a href={`/live/${l.id}/board`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration:'none', minHeight:44, display:'grid', placeItems:'center' }}>Board</a>
              </div>
            ))}
            {data.live.length === 0 && data.canCreateLive && (
              <a href="/live/setup" style={{ ...btn('primary'), textDecoration:'none', textAlign:'center', padding:14, fontSize:15 }}>Start tonight&apos;s live session</a>
            )}
          </div>
        </section>
      )}

      {/* Attendance: everyone registered in tonight's live session */}
      {data?.sessions.map((s) => (
        <section key={s.id} style={{ ...cardStyle, padding:14 }}>
          <h2 style={{ fontSize:18, fontWeight:900, margin:'0 0 2px' }}>{s.title}</h2>
          <div style={{ color:T.muted, fontSize:13, marginBottom:10 }}>{s.venue} · {s.time}</div>
          <div style={{ fontSize:28, fontWeight:900, marginBottom:4 }}>
            {s.attendees.length}<span style={{ color:T.muted, fontSize:16, fontWeight:600 }}> attended · {s.booked} booked</span>
          </div>
          <div style={{ color:T.muted, fontSize:13, marginBottom:12, lineHeight:1.5 }}>
            {!s.attendanceReady ? 'Run migration 029 in Supabase to turn on attendance.'
              : !s.hasLiveSession ? "Start tonight's live session: attendance fills in as players scan the QR and register."
              : 'Everyone who registers by scanning the QR, plus anyone you add.'}
          </div>

          <div style={{ display:'grid', gap:6, marginBottom:12 }}>
            {s.attendees.map((a) => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, minHeight:48, padding:'8px 12px',
                background:T.card2, border:`1px solid ${T.border}`, borderRadius:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:16 }}>{a.name}</div>
                  {a.email && <div style={{ color:T.muted, fontSize:12, overflow:'hidden', textOverflow:'ellipsis' }}>{a.email}</div>}
                </div>
                {a.booked === true && <span style={{ fontSize:11, fontWeight:700, color:T.accent }}>Booked</span>}
                {a.booked === false && <span style={{ fontSize:11, fontWeight:700, color:T.muted }}>Plus-one / guest</span>}
              </div>
            ))}
            {s.attendanceReady && s.hasLiveSession && s.attendees.length === 0 &&
              <div style={{ color:T.muted }}>No one has registered yet.</div>}
          </div>

          {s.attendanceReady && (adding !== s.id ? (
            <button onClick={() => { setAdding(s.id); setErr(null) }} style={{ ...btn('ghost'), width:'100%', minHeight:44 }}>
              + Add a player who isn&apos;t on the list
            </button>
          ) : (
            <div style={{ display:'grid', gap:8, padding:12, border:`1px solid ${T.border}`, borderRadius:10 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <input aria-label="First name" placeholder="First name" value={form.first} style={inp()}
                  onChange={(e) => setForm({ ...form, first: e.target.value })} />
                <input aria-label="Last name" placeholder="Last name" value={form.last} style={inp()}
                  onChange={(e) => setForm({ ...form, last: e.target.value })} />
              </div>
              <select aria-label="Level" value={form.level} style={inp()} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                {LEVEL_INFO.map((l) => <option key={l.level} value={l.level}>{l.label}</option>)}
              </select>
              <input aria-label="Email (optional)" placeholder="Email (optional)" type="email" value={form.email} style={inp()}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <button onClick={() => setAdding(null)} style={{ ...btn('ghost'), minHeight:44 }}>Cancel</button>
                <button disabled={busy === s.id || !form.first.trim()} onClick={() => addAttendee(s.id)}
                  style={{ ...btn('primary'), minHeight:44 }}>{busy === s.id ? 'Adding…' : 'Add to tonight'}</button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

/** The authenticator step (Phase 5d) only shows if STAFF_TWO_STEP=on; it's off by default. */
export default function LeadPage() {
  return <RequireTwoStep><LeadPageInner /></RequireTwoStep>
}
