'use client'
import { RequireTwoStep } from '@/app/_components/TwoStep'
import { useCallback, useEffect, useState } from 'react'
import { T, btn, cardStyle } from '../live/_components/theme'
import { staffHeaders, whoAmI, signOutStaff } from '@/lib/staffClient'

type Console = {
  role: string
  canCreateLive: boolean
  sessions: { id: string; title: string; venue: string; date: string; time: string; capacity: number; booked: number; arrived: number
    attendees: { id: string; name: string; spaces: number; checkedIn: boolean }[] }[]
  live: { id: string; name: string; status: string }[]
}

const wrap: React.CSSProperties = { minHeight:'100vh', background:T.bg, color:T.text, padding:'20px 16px 48px',
  fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box', maxWidth:560, margin:'0 auto' }

/**
 * Session lead console (Roadmap Phase 5b). Only what running the night needs:
 * who's coming and who's arrived, and a way into tonight's live session and
 * timer. Nothing about payments, emails or other sessions. The server decides
 * what's shown (lib/lead.ts); hiding things here is not the protection.
 */
function LeadPageInner() {
  const [who, setWho] = useState<{ email: string | null; role: string } | null | undefined>(undefined)
  const [data, setData] = useState<Console | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'waiting'>('waiting')

  const load = useCallback(async () => {
    const res = await fetch('/api/lead', { cache:'no-store', headers: staffHeaders() })
    if (res.ok) setData(await res.json()); else setErr('Could not load your session')
  }, [])

  useEffect(() => { whoAmI().then((w) => { setWho(w); if (w) load() }) }, [load])
  useEffect(() => { if (!who) return; const t = setInterval(load, 20000); return () => clearInterval(t) }, [who, load])

  const checkIn = async (bookingId: string, on: boolean) => {
    setBusy(bookingId); setErr(null)
    const res = await fetch('/api/lead/checkin', { method:'POST', headers: { 'Content-Type':'application/json', ...staffHeaders() },
      body: JSON.stringify({ booking_id: bookingId, checked_in: on }) })
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? 'Check-in failed')
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

      {/* Check-in */}
      {data?.sessions.map((s) => {
        const list = s.attendees.filter((a) => filter === 'all' || !a.checkedIn)
        return (
          <section key={s.id} style={{ ...cardStyle, padding:14 }}>
            <h2 style={{ fontSize:18, fontWeight:900, margin:'0 0 2px' }}>{s.title}</h2>
            <div style={{ color:T.muted, fontSize:13, marginBottom:10 }}>{s.venue} · {s.time}</div>
            <div style={{ fontSize:28, fontWeight:900, marginBottom:10 }}>
              {s.arrived}<span style={{ color:T.muted, fontSize:16, fontWeight:600 }}> / {s.booked} arrived</span>
            </div>
            <div role="tablist" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
              {(['waiting', 'all'] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  style={{ ...btn(filter === f ? 'primary' : 'ghost'), minHeight:44 }}>{f === 'waiting' ? 'Not arrived' : 'Everyone'}</button>
              ))}
            </div>
            <div style={{ display:'grid', gap:6 }}>
              {list.map((a) => (
                <button key={a.id} disabled={busy === a.id} onClick={() => checkIn(a.id, !a.checkedIn)}
                  aria-pressed={a.checkedIn}
                  style={{ display:'flex', alignItems:'center', gap:12, width:'100%', minHeight:56, padding:'10px 12px',
                    background: a.checkedIn ? T.accentDim : T.card2, border:`1px solid ${a.checkedIn ? T.accentBorder : T.border}`,
                    borderRadius:10, color:T.text, fontFamily:'inherit', fontSize:17, cursor:'pointer', textAlign:'left' }}>
                  <span aria-hidden style={{ width:28, height:28, borderRadius:8, display:'grid', placeItems:'center', flexShrink:0,
                    background: a.checkedIn ? T.accent : 'transparent', border:`2px solid ${a.checkedIn ? T.accent : T.muted}`, color:T.bg, fontWeight:900 }}>
                    {a.checkedIn ? '✓' : ''}
                  </span>
                  <span style={{ flex:1, fontWeight:700 }}>{a.name}</span>
                  {a.spaces > 1 && <span style={{ color:T.muted, fontSize:14 }}>×{a.spaces}</span>}
                </button>
              ))}
              {list.length === 0 && <div style={{ color:T.muted }}>{filter === 'waiting' ? 'Everyone has arrived 🎉' : 'No bookings yet.'}</div>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Owners and admins pass the authenticator step first (Phase 5d). */
export default function LeadPage() {
  return <RequireTwoStep><LeadPageInner /></RequireTwoStep>
}
