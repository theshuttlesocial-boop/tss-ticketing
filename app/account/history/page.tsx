'use client'
import { useEffect, useState } from 'react'
import { authHeader } from '@/lib/accountClient'
import { T, btn } from '../../live/_components/theme'
import type { History, Tally } from '@/lib/accounts/history'

const wrap: React.CSSProperties = { minHeight:'100vh', background:T.bg, color:T.text, padding:'28px 18px 48px',
  fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box', maxWidth:620, margin:'0 auto' }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
const badge = (r: 'W' | 'L' | 'D') => ({ W: T.accent, L: T.danger, D: T.warning }[r])

/**
 * My TSS history: rating per session, every game, head-to-head and best
 * partners. Only your own rating; other players' only if you both opted in.
 */
export default function HistoryPage() {
  const [h, setH] = useState<History | null>(null)
  const [state, setState] = useState<'loading' | 'out' | 'ok' | 'error'>('loading')
  const [tab, setTab] = useState<'sessions' | 'opponents' | 'partners'>('sessions')

  useEffect(() => {
    (async () => {
      const auth = await authHeader()
      if (!auth.Authorization) { setState('out'); return }
      const res = await fetch('/api/me/history', { cache:'no-store', headers: auth })
      if (res.status === 401) { setState('out'); return }
      if (!res.ok) { setState('error'); return }
      setH((await res.json()).history); setState('ok')
    })()
  }, [])

  if (state === 'loading') return <div style={{ ...wrap, color:T.muted }}>Loading…</div>
  if (state === 'out') return <div style={wrap}><a href="/account?next=/account/history" style={{ color:T.accent }}>Sign in</a> to see your history.</div>
  if (state === 'error' || !h) return <div style={{ ...wrap, color:T.danger }}>Couldn&apos;t load your history. Try again in a moment.</div>

  const trend = [...h.sessions].reverse()
  return (
    <div style={wrap}>
      <a href="/account" style={{ color:T.muted, fontSize:14, textDecoration:'none' }}>← My TSS</a>
      <h1 style={{ fontSize:30, fontWeight:900, margin:'14px 0 12px' }}>My games</h1>

      {h.totals.sessions === 0 ? (
        <p style={{ color:T.muted, fontSize:15, lineHeight:1.5 }}>
          Nothing yet. Next time you&apos;re at a session, be signed in when you scan the QR code and your games will appear here.
          Sessions from before you had an account can be added by the organiser.
        </p>
      ) : <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
          {[['Sessions', h.totals.sessions], ['Games', h.totals.games], ['Won', h.totals.won], ['Lost', h.totals.lost]].map(([k, v]) => (
            <div key={k as string} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
              <div style={{ fontSize:24, fontWeight:900 }}>{v}</div>
              <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'1px' }}>{k}</div>
            </div>
          ))}
        </div>

        {trend.length > 0 && <Trend points={trend.map((s) => ({ label: s.name, value: s.end }))} />}

        <div role="tablist" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, margin:'16px 0 12px' }}>
          {(['sessions', 'opponents', 'partners'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              style={{ ...btn(tab === t ? 'primary' : 'ghost'), minHeight:44, padding:'10px 4px' }}>
              {t === 'sessions' ? 'Sessions' : t === 'opponents' ? 'Head-to-head' : 'Best partners'}
            </button>
          ))}
        </div>

        {tab === 'sessions' && h.sessions.map((s) => (
          <section key={s.sessionId} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:8 }}>
              <div><strong>{s.name}</strong><div style={{ color:T.muted, fontSize:12 }}>{day(s.date)}</div></div>
              <div style={{ textAlign:'right', fontSize:13 }}>
                <div style={{ fontWeight:800, fontSize:18 }}>{s.end}</div>
                <div style={{ color: s.end >= s.start ? T.accent : T.danger }}>{s.end >= s.start ? '+' : ''}{s.end - s.start} this session</div>
              </div>
            </div>
            {s.games.map((g) => (
              <div key={`${g.round}-${g.court}`} style={{ display:'flex', gap:8, alignItems:'center', fontSize:14, padding:'6px 0', borderTop:`1px solid ${T.border}` }}>
                <span style={{ width:22, height:22, borderRadius:6, background:badge(g.result), color:T.bg, fontWeight:900,
                  fontSize:12, display:'grid', placeItems:'center', flexShrink:0 }}>{g.result}</span>
                <span style={{ flex:1, minWidth:0 }}>
                  with <strong>{g.partner}</strong> v {g.opponents.join(' & ')}
                </span>
                <strong style={{ fontVariantNumeric:'tabular-nums' }}>{g.my}–{g.their}</strong>
              </div>
            ))}
          </section>
        ))}
        {tab === 'opponents' && <Tallies rows={h.headToHead} empty="No opponents yet." verb="v" />}
        {tab === 'partners' && <Tallies rows={h.partners} empty="Play at least two games with someone to see them here." verb="with" />}
      </>}
    </div>
  )
}

function Tallies({ rows, empty, verb }: { rows: Tally[]; empty: string; verb: string }) {
  if (!rows.length) return <p style={{ color:T.muted }}>{empty}</p>
  return (
    <div style={{ display:'grid', gap:6 }}>
      {rows.map((t) => (
        <div key={t.key} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px', display:'flex', gap:10, alignItems:'center' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700 }}><span style={{ color:T.muted, fontWeight:400 }}>{verb} </span>{t.name}</div>
            <div style={{ color:T.muted, fontSize:12 }}>
              {t.games} game{t.games === 1 ? '' : 's'} · points {t.pointsFor}–{t.pointsAgainst}{t.rating !== undefined ? ` · rating ${t.rating}` : ''}
            </div>
          </div>
          <div style={{ fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
            <span style={{ color:T.accent }}>{t.won}W</span> <span style={{ color:T.danger }}>{t.lost}L</span>{t.drawn ? <> <span style={{ color:T.warning }}>{t.drawn}D</span></> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Rating at the end of each session, oldest to newest. */
function Trend({ points }: { points: { label: string; value: number }[] }) {
  if (points.length < 2) return null
  const W = 320, H = 70, vs = points.map((p) => p.value)
  const lo = Math.min(...vs) - 10, hi = Math.max(...vs) + 10
  const x = (i: number) => (i / (points.length - 1)) * (W - 20) + 10
  const y = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20)
  return (
    <figure style={{ margin:0, background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'10px 12px' }}>
      <figcaption style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>
        Rating at the end of each session
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Rating trend: ${vs.join(', ')}`}>
        <polyline fill="none" stroke={T.accent} strokeWidth={2.5} points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={T.accent}><title>{`${p.label}: ${p.value}`}</title></circle>)}
      </svg>
    </figure>
  )
}
