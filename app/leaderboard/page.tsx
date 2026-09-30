'use client'
import { useEffect, useState } from 'react'
import { T } from '@/app/_design/theme'

/** Public, opt-in only: players who chose to appear, by first name and last initial. */
export default function LeaderboardPage() {
  const [rows, setRows] = useState<{ name: string; rating: number; sessions: number }[] | null>(null)
  useEffect(() => { fetch('/api/leaderboard').then((r) => r.json()).then((j) => setRows(j.players ?? [])).catch(() => setRows([])) }, [])
  return (
    <main style={{ color:T.text, padding:'28px 18px 48px', fontFamily:'inherit',
      boxSizing:'border-box', maxWidth:560, margin:'0 auto' }}>
      <a href="/tickets" style={{ color:T.muted, fontSize:14, textDecoration:'none' }}>← Sessions</a>
      <h1 style={{ fontSize:36, fontWeight:900, letterSpacing:'-0.03em', margin:'14px 0 6px' }}>Leaderboard</h1>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 18px', lineHeight:1.5 }}>
        Only players who&apos;ve chosen to appear. Rating from their most recent session.
        Want to be on it? Turn it on in <a href="/account" style={{ color:T.accent }}>My portal</a>.
      </p>
      {rows === null ? <p style={{ color:T.muted }}>Loading…</p> : rows.length === 0 ? <p style={{ color:T.muted }}>Nobody has opted in yet.</p> : (
        <ol style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:6 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'12px 16px', display:'flex', gap:12, alignItems:'center' }}>
              <span style={{ width:24, color:T.muted, fontWeight:700 }}>{i + 1}</span>
              <span style={{ flex:1, fontWeight:700 }}>{r.name}</span>
              <span style={{ color:T.muted, fontSize:12 }}>{r.sessions} session{r.sessions === 1 ? '' : 's'}</span>
              <strong style={{ fontVariantNumeric:'tabular-nums', minWidth:44, textAlign:'right', fontStyle:'italic', fontWeight:900, fontSize:18, color:T.accent }}>{r.rating}</strong>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
