'use client'
import { use, useState, useMemo, useEffect } from 'react'
import { useLiveSession } from '../../_hooks/useLiveSession'
import { CourtCard } from '../../_components/CourtCard'
import { T, inp, cardStyle, btn } from '../../_components/theme'
import { standings, grandFinal, roundComplete, DEFAULT_CONFIG } from '@/lib/live-session/engine'
import type { Config } from '@/lib/live-session/engine'

const SLOTS = ['A.a', 'A.b', 'B.a', 'B.b'] as const
type Slot = typeof SLOTS[number]

export default function LiveAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const { session, error, loading, refetch } = useLiveSession(id)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({})
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('tss-admin-secret')
    if (saved) { setSecret(saved); setAuthed(true) }
  }, [])

  const call = async (path: string, init: RequestInit = {}) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret, ...(init.headers ?? {}) },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(json.error ?? `Request failed (${res.status})`); return null }
      await refetch()
      return json
    } finally { setBusy(false) }
  }

  const round = session?.rounds[session.rounds.length - 1]
  const complete = session && round ? roundComplete(session, round.index) : false

  const table = useMemo(
    () => session ? standings(session.players, session.results, session.config.finals) : [],
    [session])
  const final = useMemo(
    () => table.length ? grandFinal(table, session!.config.finals) : null,
    [table, session])

  if (!authed) return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'grid', placeItems:'center',
      fontFamily:'DM Sans, system-ui, sans-serif' }}>
      <div style={{ ...cardStyle, padding:24, width:320 }}>
        <h1 style={{ color:T.text, fontSize:20, margin:'0 0 14px' }}>Live session admin</h1>
        <input type="password" placeholder="Admin secret" style={inp()} value={secret}
          onChange={e => setSecret(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && secret) { sessionStorage.setItem('tss-admin-secret', secret); setAuthed(true) } }} />
        <button style={{ ...btn('primary'), width:'100%', marginTop:12 }}
          onClick={() => { if (secret) { sessionStorage.setItem('tss-admin-secret', secret); setAuthed(true) } }}>
          Unlock
        </button>
      </div>
    </div>
  )

  if (loading) return <div style={{ minHeight:'100vh', background:T.bg, color:T.muted, display:'grid', placeItems:'center' }}>Loading…</div>
  if (error || !session) return <div style={{ minHeight:'100vh', background:T.bg, color:T.danger, display:'grid', placeItems:'center' }}>{error}</div>

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, padding:'22px 20px',
      fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, margin:0 }}>Live session</h1>
          <div style={{ color:T.muted, fontSize:14 }}>
            {Object.keys(session.players).length} players · {session.config.rotation.courts} courts · seed {session.seed}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <a href={`/live/${id}/board`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration:'none' }}>Open board</a>
          <button style={btn()} onClick={() => setShowQr(v => !v)}>{showQr ? 'Hide' : 'Show'} QR codes</button>
        </div>
      </div>

      {msg && <div style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, color:T.danger,
        padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:14 }}>{msg}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,2fr) minmax(280px,1fr)', gap:16, alignItems:'start' }}>
        <div>
          {/* ── Current round ── */}
          <section style={{ ...cardStyle, padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h2 style={{ fontSize:18, margin:0 }}>{round ? `Round ${round.index}` : 'No rounds yet'}</h2>
              {round && <span style={{ fontSize:13, color: complete ? T.accent : T.warning }}>
                {complete ? 'All scores in' : 'Awaiting scores'}
              </span>}
            </div>

            {round ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
                {round.matches.map(m => {
                  const existing = session.results.find(r => r.round === round.index && r.court === m.court)
                  const key = `${round.index}-${m.court}`
                  const val = scores[key] ?? { a: existing ? String(existing.scoreA) : '', b: existing ? String(existing.scoreB) : '' }
                  return (
                    <CourtCard key={m.court} match={m} players={session.players}
                      scoreA={existing?.scoreA ?? null} scoreB={existing?.scoreB ?? null}>
                      <div style={{ display:'flex', gap:6, marginTop:10, alignItems:'center' }}>
                        <input inputMode="numeric" placeholder="A" style={inp({ padding:'7px 9px', textAlign:'center' })}
                          value={val.a} onChange={e => setScores(s => ({ ...s, [key]: { ...val, a: e.target.value } }))} />
                        <input inputMode="numeric" placeholder="B" style={inp({ padding:'7px 9px', textAlign:'center' })}
                          value={val.b} onChange={e => setScores(s => ({ ...s, [key]: { ...val, b: e.target.value } }))} />
                        <button disabled={busy || val.a === '' || val.b === ''} style={{ ...btn('primary'), padding:'7px 12px' }}
                          onClick={async () => {
                            const ok = await call(`/api/live/${id}/score`, { method:'POST', body: JSON.stringify({
                              round: round.index, court: m.court, score_a: Number(val.a), score_b: Number(val.b) }) })
                            if (ok) setScores(s => { const n = { ...s }; delete n[key]; return n })
                          }}>Save</button>
                      </div>

                      {overrideMode && (
                        <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                          <div style={{ fontSize:11, color:T.muted, marginBottom:6 }}>Override slot</div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                            {SLOTS.map(slot => (
                              <select key={slot} style={inp({ padding:'6px 8px', fontSize:12 })}
                                defaultValue=""
                                onChange={async e => {
                                  if (!e.target.value) return
                                  await call(`/api/live/${id}/override`, { method:'POST', body: JSON.stringify({
                                    round: round.index, court: m.court, slot, player_id: e.target.value }) })
                                  e.target.value = ''
                                }}>
                                <option value="">{slot}</option>
                                {Object.values(session.players).map(p =>
                                  <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            ))}
                          </div>
                        </div>
                      )}
                    </CourtCard>
                  )
                })}
              </div>
            ) : (
              <p style={{ color:T.muted, fontSize:14 }}>Generate the first round to begin.</p>
            )}

            {round && round.sitOuts.length > 0 && (
              <div style={{ marginTop:12, fontSize:13, color:T.muted }}>
                <strong style={{ color:T.text }}>Sitting out:</strong>{' '}
                {round.sitOuts.map(p => session.players[p]?.name).join(', ')}
              </div>
            )}

            <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap', alignItems:'center' }}>
              <button style={btn('primary')} disabled={busy || (!!round && !complete)}
                onClick={() => call(`/api/live/${id}/round`, { method:'POST' })}>
                Generate next round
              </button>
              <button style={btn()} disabled={busy || !round}
                onClick={() => { if (confirm('Undo the last round? Its scores will be discarded.')) call(`/api/live/${id}/round`, { method:'DELETE' }) }}>
                Undo last round
              </button>
              <button style={btn()} onClick={() => setOverrideMode(v => !v)}>
                {overrideMode ? 'Done overriding' : 'Override slots'}
              </button>
              {round && !complete && <span style={{ fontSize:12, color:T.muted }}>Enter all scores to unlock</span>}
            </div>
          </section>

          {showQr && (
            <section style={{ ...cardStyle, padding:16 }}>
              <h2 style={{ fontSize:16, margin:'0 0 4px' }}>Player QR codes</h2>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 12px' }}>
                Each links to that player&apos;s own page. Print or hold up the screen.
              </p>
              <QrGrid sessionId={id} players={Object.values(session.players)} origin={origin} />
            </section>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div>
          <section style={{ ...cardStyle, padding:16 }}>
            <h2 style={{ fontSize:16, margin:'0 0 10px' }}>Standings</h2>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ color:T.muted, textAlign:'left' }}>
                    <th style={{ padding:'4px 6px' }}>#</th>
                    <th style={{ padding:'4px 6px' }}>Player</th>
                    <th style={{ padding:'4px 6px', textAlign:'right' }}>Rating</th>
                    <th style={{ padding:'4px 6px', textAlign:'right' }}>Conf</th>
                    <th style={{ padding:'4px 6px', textAlign:'right' }}>G</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((s, i) => (
                    <tr key={s.id} style={{ borderTop:`1px solid ${T.border}`,
                      background: i < session.config.finals.finalists && s.eligible ? T.accentDim : 'transparent' }}>
                      <td style={{ padding:'6px', color:T.muted }}>{i + 1}</td>
                      <td style={{ padding:'6px', fontWeight:600 }}>{s.name}</td>
                      <td style={{ padding:'6px', textAlign:'right' }}>{Math.round(s.rating)}</td>
                      <td style={{ padding:'6px', textAlign:'right', color:T.muted }}>{Math.round(s.confRating)}</td>
                      <td style={{ padding:'6px', textAlign:'right', color:T.muted }}>{s.games}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color:T.muted, fontSize:11, marginTop:8 }}>
              Conf = rating shrunk toward {session.config.finals.base} by games/(games+{session.config.finals.shrink}).
              Finalists highlighted once eligible ({session.config.finals.minGames}+ games).
            </p>
          </section>

          <section style={{ ...cardStyle, padding:16 }}>
            <h2 style={{ fontSize:16, margin:'0 0 10px' }}>Grand final</h2>
            {final ? (
              <div style={{ fontSize:15, lineHeight:1.7 }}>
                <div style={{ fontWeight:700, color:T.accent }}>
                  {session.players[final.teamA.a]?.name} + {session.players[final.teamA.b]?.name}
                </div>
                <div style={{ color:T.muted, fontSize:12 }}>versus</div>
                <div style={{ fontWeight:700, color:T.accent }}>
                  {session.players[final.teamB.a]?.name} + {session.players[final.teamB.b]?.name}
                </div>
              </div>
            ) : (
              <p style={{ color:T.muted, fontSize:13, margin:0 }}>
                Not enough players with {session.config.finals.minGames}+ games yet.
              </p>
            )}
          </section>

          <TuningPanel config={session.config} busy={busy}
            onApply={cfg => call(`/api/live/${id}`, { method:'PATCH', body: JSON.stringify({ config: cfg }) })} />
        </div>
      </div>
    </div>
  )
}

/** Client-side QR grid — generated in the browser to keep this page one component. */
function QrGrid({ sessionId, players, origin }: {
  sessionId: string; players: { id: string; name: string }[]; origin: string
}) {
  const [svgs, setSvgs] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    import('qrcode').then(async QR => {
      const out: Record<string, string> = {}
      for (const p of players) {
        out[p.id] = await QR.toString(`${origin}/live/${sessionId}/player/${p.id}`,
          { type:'svg', errorCorrectionLevel:'M', margin:2, width:104 })
      }
      if (!cancelled) setSvgs(out)
    })
    return () => { cancelled = true }
  }, [sessionId, players, origin])

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(128px,1fr))', gap:12 }}>
      {players.map(p => (
        <div key={p.id} style={{ background:T.card2, border:`1px solid ${T.border}`,
          borderRadius:10, padding:10, textAlign:'center' }}>
          <div style={{ background:'#fff', borderRadius:6, padding:4, lineHeight:0, minHeight:104 }}
            dangerouslySetInnerHTML={{ __html: svgs[p.id] ?? '' }} />
          <div style={{ fontSize:12, fontWeight:600, marginTop:7 }}>{p.name}</div>
        </div>
      ))}
    </div>
  )
}

function TuningPanel({ config, onApply, busy }: {
  config: Config; onApply: (c: Config) => void; busy: boolean
}) {
  const [k, setK] = useState(config.rating.kSchedule.join(','))
  const [start, setStart] = useState([config.rating.start.beginner, config.rating.start.standard, config.rating.start.strong].join(','))
  const [clip, setClip] = useState(config.rating.clip.join(','))
  const [promo, setPromo] = useState(String(config.rating.promotionRounds))
  const [cap, setCap] = useState(config.rotation.movementCap == null ? '' : String(config.rotation.movementCap))
  const [begCourts, setBegCourts] = useState(config.rotation.beginnerCourts.join(','))
  const [cost, setCost] = useState([config.rotation.cost.repeatPartner, config.rotation.cost.repeatOpponent, config.rotation.cost.per100Gap].join(','))
  const [spread, setSpread] = useState(String(config.rotation.maxCourtSpread))

  const nums = (s: string) => s.split(',').map(x => Number(x.trim())).filter(n => !Number.isNaN(n))

  const apply = () => {
    const [b, st, sg] = nums(start)
    const [cl, ch] = nums(clip)
    const [rp, ro, pg] = nums(cost)
    onApply({
      ...config,
      rating: {
        ...config.rating,
        kSchedule: nums(k),
        start: { beginner: b, standard: st, strong: sg },
        clip: [cl, ch],
        promotionRounds: Number(promo),
      },
      rotation: {
        ...config.rotation,
        movementCap: cap.trim() === '' ? null : Number(cap),
        beginnerCourts: nums(begCourts),
        cost: { repeatPartner: rp, repeatOpponent: ro, per100Gap: pg },
        maxCourtSpread: Number(spread),
      },
    })
  }

  const Field = ({ label, value, set }: { label: string; value: string; set: (v: string) => void }) => (
    <label style={{ display:'block', marginBottom:9 }}>
      <span style={{ fontSize:11, color:T.muted, display:'block', marginBottom:3 }}>{label}</span>
      <input style={inp({ padding:'7px 10px', fontSize:13 })} value={value} onChange={e => set(e.target.value)} />
    </label>
  )

  return (
    <section style={{ ...cardStyle, padding:16 }}>
      <details>
        <summary style={{ cursor:'pointer', fontSize:16, fontWeight:700 }}>Tuning</summary>
        <div style={{ marginTop:12 }}>
          <Field label="K schedule (games 1,2,3,4,5+)" value={k} set={setK} />
          <Field label="Start: beginner / standard / strong" value={start} set={setStart} />
          <Field label="Expected-share clip" value={clip} set={setClip} />
          <Field label="Promotion rounds above median" value={promo} set={setPromo} />
          <Field label="Movement cap (blank = none)" value={cap} set={setCap} />
          <Field label="Beginner courts" value={begCourts} set={setBegCourts} />
          <Field label="Cost: partner / opponent / per 100 pts" value={cost} set={setCost} />
          <Field label="Max court spread for swaps" value={spread} set={setSpread} />
          <button style={{ ...btn('primary'), width:'100%' }} disabled={busy} onClick={apply}>
            Apply &amp; recompute
          </button>
          <p style={{ color:T.muted, fontSize:11, marginTop:8 }}>
            Rating changes recompute from all scores. Rounds already generated keep their assignments.
          </p>
        </div>
      </details>
    </section>
  )
}
