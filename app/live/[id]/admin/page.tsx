'use client'
import { use, useState, useMemo, useEffect } from 'react'
import { useLiveSession } from '../../_hooks/useLiveSession'
import { T, inp, cardStyle, btn } from '../../_components/theme'
import { FormBadges } from '../../_components/Form'
import { RoundTimer } from '../../_components/RoundTimer'
import { ScoreCard } from './ScoreCard'
import { standings, grandFinal, roundComplete } from '@/lib/live-session/engine'
import type { Config, Level } from '@/lib/live-session/engine'
import { LEVEL_INFO, LEVELS } from '@/lib/live-session/levels'
import { displayNames } from '@/lib/live-session/displayNames'

type Tab = 'courts' | 'standings' | 'roster' | 'settings'
const SLOTS = ['A.a', 'A.b', 'B.a', 'B.b'] as const

export default function LiveAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const { session, error, loading, refetch, isAdmin } =
    useLiveSession(id, authed ? secret : undefined)
  const [tab, setTab] = useState<Tab>('courts')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [review, setReview] = useState(false)

  useEffect(() => {
    const s = sessionStorage.getItem('tss-admin-secret')
    if (s) { setSecret(s); setAuthed(true) }
  }, [])

  const call = async (path: string, init: RequestInit = {}) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(path, {
        ...init,
        headers: { 'Content-Type':'application/json', 'x-admin-secret': secret, ...(init.headers ?? {}) },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(json.error ?? `Failed (${res.status})`); return null }
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
    () => table.length && session ? grandFinal(table, session.config.finals) : null,
    [table, session])

  if (!authed) return <Gate secret={secret} setSecret={setSecret} setAuthed={setAuthed} />
  if (loading) return <Centre>Loading…</Centre>
  if (error || !session) return <Centre colour={T.danger}>{error}</Centre>
  if (isAdmin === false) return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'grid', placeItems:'center',
      fontFamily:'DM Sans, system-ui, sans-serif', padding:20 }}>
      <div style={{ ...cardStyle, padding:24, maxWidth:340, textAlign:'center' }}>
        <div style={{ color:T.danger, fontSize:16, fontWeight:700, marginBottom:6 }}>
          That admin secret is not right
        </div>
        <button style={{ ...btn('primary'), width:'100%', marginTop:8 }} onClick={() => {
          sessionStorage.removeItem('tss-admin-secret'); setSecret(''); setAuthed(false)
        }}>Try again</button>
      </div>
    </div>
  )

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const short = displayNames(Object.values(session.players).map((p: any) => ({ id: p.id, name: p.name })))
  const nm = (pid: string) => short[pid] ?? session.players[pid]?.name ?? '—'
  const scoreOf = (court: number) =>
    round ? session.results.find(r => r.round === round.index && r.court === court) : undefined

  const TABS: { id: Tab; label: string }[] = [
    { id:'courts', label:'Courts' },
    { id:'standings', label:'Standings' },
    { id:'roster', label:'Roster' },
    { id:'settings', label:'Settings' },
  ]

  return (
    <div style={{
      minHeight:'100vh', background:T.bg, color:T.text,
      fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box',
      paddingBottom:40,
    }}>
      {/* header */}
      <div style={{ padding:'14px 14px 0', maxWidth:760, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10 }}>
          <h1 style={{ fontSize:20, fontWeight:900, margin:0 }}>{(session as any).name ?? 'Live session'}</h1>
          <a href={`/live/${id}/board`} target="_blank" rel="noreferrer"
            style={{ color:T.muted, fontSize:13, textDecoration:'none' }}>Board ↗</a>
        </div>
        <div style={{ color:T.muted, fontSize:13, marginTop:2 }}>
          {Object.keys(session.players).length} players · {session.config.rotation.courts} courts
          {round && ` · round ${round.index}`}
        </div>
      </div>

      {/* tabs */}
      <div style={{
        display:'flex', gap:4, padding:'12px 14px 0', maxWidth:760, margin:'0 auto',
        position:'sticky', top:0, background:T.bg, zIndex:5, overflowX:'auto',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:'1 0 auto', padding:'10px 14px', fontSize:14, fontWeight:700,
            borderRadius:'10px 10px 0 0', cursor:'pointer', fontFamily:'inherit',
            border:`1px solid ${tab===t.id ? T.border : 'transparent'}`, borderBottom:'none',
            background: tab===t.id ? T.card : 'transparent',
            color: tab===t.id ? T.text : T.muted,
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ borderTop:`1px solid ${T.border}`, marginTop:-1 }} />

      <div style={{ padding:'14px', maxWidth:760, margin:'0 auto' }}>
        {msg && <div style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, color:T.danger,
          padding:'10px 14px', borderRadius:8, marginBottom:12, fontSize:14 }}>{msg}</div>}

        {/* ── COURTS ───────────────────────────────────────────── */}
        {tab === 'courts' && (
          <>
            <div style={{ marginBottom:12 }}>
              <RoundTimer minutes={8} />
            </div>

            {round ? (
              <div style={{ display:'grid', gap:10 }}>
                {round.matches.map(m => (
                  <div key={m.court}>
                    <ScoreCard match={m} players={session.players as any}
                      existing={scoreOf(m.court)} busy={busy}
                      onSave={(a, b) => call(`/api/live/${id}/score`, {
                        method:'POST',
                        body: JSON.stringify({ round: round.index, court: m.court, score_a: a, score_b: b }),
                      })} />
                    {overrideMode && (
                      <div style={{ background:T.card2, border:`1px solid ${T.border}`,
                        borderTop:'none', borderRadius:'0 0 12px 12px', padding:10 }}>
                        <div style={{ fontSize:11, color:T.muted, marginBottom:6 }}>Swap a player into court {m.court}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                          {SLOTS.map(slot => (
                            <select key={slot} defaultValue="" style={inp({ padding:'8px', fontSize:12 })}
                              onChange={async e => {
                                if (!e.target.value) return
                                await call(`/api/live/${id}/override`, { method:'POST', body: JSON.stringify({
                                  round: round.index, court: m.court, slot, player_id: e.target.value }) })
                                e.target.value = ''
                              }}>
                              <option value="">{slot}</option>
                              {Object.values(session.players).map((p: any) =>
                                <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color:T.muted, fontSize:14 }}>No round yet. Generate the first one below.</p>
            )}

            {round && round.sitOuts.length > 0 && (
              <div style={{ marginTop:12, background:T.card, border:`1px solid ${T.border}`,
                borderRadius:12, padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase',
                  letterSpacing:'1px', fontWeight:700, marginBottom:6 }}>
                  Sitting out ({round.sitOuts.length})
                </div>
                <div style={{ fontSize:14, lineHeight:1.6 }}>
                  {round.sitOuts.map(nm).join(' · ')}
                </div>
              </div>
            )}

            {/* actions */}
            <div style={{ display:'grid', gap:8, marginTop:16 }}>
              <button style={{ ...btn('primary'), padding:'14px', fontSize:15 }}
                disabled={busy || (!!round && !complete)}
                onClick={() => { if (round) setReview(true); else call(`/api/live/${id}/round`, { method:'POST' }) }}>
                {round ? 'Review scores & generate next round' : 'Generate first round'}
              </button>
              {round && !complete && (
                <div style={{ fontSize:13, color:T.warning, textAlign:'center' }}>
                  Enter every score to unlock
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <button style={btn()} onClick={() => setOverrideMode(v => !v)}>
                  {overrideMode ? 'Done swapping' : 'Swap players'}
                </button>
                <button style={btn()} disabled={busy || !round}
                  onClick={() => { if (confirm('Undo the last round? Its scores are discarded.'))
                    call(`/api/live/${id}/round`, { method:'DELETE' }) }}>
                  Undo round
                </button>
              </div>
              <button style={{ ...btn(), borderColor:T.warning, color:T.warning }}
                disabled={busy || (!!round && !complete)}
                onClick={() => {
                  if (confirm('Generate the GRAND FINAL? This ends the normal rounds.'))
                    call(`/api/live/${id}/final`, { method:'POST' })
                }}>
                🏆 Generate grand final
              </button>
            </div>
          </>
        )}

        {/* ── STANDINGS ────────────────────────────────────────── */}
        {tab === 'standings' && (
          <>
            <section style={{ ...cardStyle, padding:14 }}>
              <h2 style={{ fontSize:15, margin:'0 0 10px' }}>Standings</h2>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr style={{ color:T.muted, textAlign:'left' }}>
                    <th style={{ padding:'4px 6px' }}>#</th>
                    <th style={{ padding:'4px 6px' }}>Player</th>
                    <th style={{ padding:'4px 6px', textAlign:'right' }}>Rating</th>
                    <th style={{ padding:'4px 6px', textAlign:'right' }}>G</th>
                    <th style={{ padding:'4px 6px' }}>Form</th>
                  </tr></thead>
                  <tbody>
                    {table.map((s, i) => (
                      <tr key={s.id} style={{ borderTop:`1px solid ${T.border}`,
                        background: i < session.config.finals.finalists && s.eligible ? T.accentDim : 'transparent' }}>
                        <td style={{ padding:'7px 6px', color:T.muted }}>{i+1}</td>
                        <td style={{ padding:'7px 6px', fontWeight:600 }}>{s.name}</td>
                        <td style={{ padding:'7px 6px', textAlign:'right' }}>{Math.round(s.rating)}</td>
                        <td style={{ padding:'7px 6px', textAlign:'right', color:T.muted }}>{s.games}</td>
                        <td style={{ padding:'7px 6px' }}>
                          <FormBadges playerId={s.id} results={session.results} max={4} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...cardStyle, padding:14 }}>
              <h2 style={{ fontSize:15, margin:'0 0 10px' }}>Grand final</h2>
              {final ? (
                <div style={{ fontSize:15, lineHeight:1.7 }}>
                  <div style={{ fontWeight:700, color:T.accent }}>
                    {nm(final.teamA.a)} + {nm(final.teamA.b)}
                  </div>
                  <div style={{ color:T.muted, fontSize:12 }}>versus</div>
                  <div style={{ fontWeight:700, color:T.accent }}>
                    {nm(final.teamB.a)} + {nm(final.teamB.b)}
                  </div>
                </div>
              ) : (
                <p style={{ color:T.muted, fontSize:13, margin:0 }}>
                  Not enough players with {session.config.finals.minGames}+ games yet.
                </p>
              )}
            </section>
          </>
        )}

        {/* ── ROSTER ───────────────────────────────────────────── */}
        {tab === 'roster' && (
          <RosterPanel session={session} busy={busy}
            onAdd={(name, level) => call(`/api/live/${id}/players`, {
              method:'POST', body: JSON.stringify({ name, level }) })}
            onLevel={(pid, level) => call(`/api/live/${id}/players`, {
              method:'PATCH', body: JSON.stringify({ player_id: pid, level }) })}
            onRemove={(pid) => call(`/api/live/${id}/players?player_id=${pid}`, { method:'DELETE' })} />
        )}

        {/* ── SETTINGS ─────────────────────────────────────────── */}
        {tab === 'settings' && (
          <>
            <SessionQr sessionId={id} origin={origin} />
            <TuningPanel config={session.config} busy={busy}
              onApply={cfg => call(`/api/live/${id}`, { method:'PATCH', body: JSON.stringify({ config: cfg }) })} />
            <section style={{ ...cardStyle, padding:14 }}>
              <h2 style={{ fontSize:15, margin:'0 0 8px' }}>End session</h2>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 10px' }}>
                Closes the session so the printed QR stops pointing at it.
              </p>
              <button style={{ ...btn('danger'), width:'100%' }} disabled={busy}
                onClick={() => { if (confirm('Finish this session?')) call(`/api/live/${id}/final`, { method:'PATCH' }) }}>
                Finish session
              </button>
            </section>
          </>
        )}
      </div>

      {/* review-before-generate */}
      {review && round && (
        <ReviewSheet
          round={round} session={session} nm={nm}
          onCancel={() => setReview(false)}
          onConfirm={async () => { setReview(false); await call(`/api/live/${id}/round`, { method:'POST' }) }}
        />
      )}
    </div>
  )
}

/* ── pieces ─────────────────────────────────────────────────── */

const Centre = ({ children, colour = T.muted }: { children: React.ReactNode; colour?: string }) => (
  <div style={{ minHeight:'100vh', background:T.bg, color:colour, display:'grid',
    placeItems:'center', fontFamily:'DM Sans, system-ui, sans-serif' }}>{children}</div>
)

function Gate({ secret, setSecret, setAuthed }: any) {
  const unlock = () => { if (secret) { sessionStorage.setItem('tss-admin-secret', secret); setAuthed(true) } }
  return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'grid', placeItems:'center',
      fontFamily:'DM Sans, system-ui, sans-serif', padding:20 }}>
      <div style={{ ...cardStyle, padding:22, width:'100%', maxWidth:330 }}>
        <h1 style={{ color:T.text, fontSize:19, margin:'0 0 14px' }}>Live session admin</h1>
        <input type="password" placeholder="Admin secret" style={inp({ fontSize:16, padding:'13px' })}
          value={secret} onChange={e => setSecret(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') unlock() }} />
        <button style={{ ...btn('primary'), width:'100%', marginTop:12, padding:'13px' }}
          onClick={unlock}>Unlock</button>
      </div>
    </div>
  )
}

/**
 * Confirmation step before a new round is drawn.
 *
 * A reversed score last session was only spotted when a player noticed his win
 * showing as a loss — by which time the next round had already been generated
 * from the wrong ratings. This replays every result in plain words ("X and Y
 * beat P and Q, 21-15") so a flipped score is obvious before it can affect
 * anything.
 */
function ReviewSheet({ round, session, nm, onCancel, onConfirm }: any) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:50,
      display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background:T.card, borderTop:`1px solid ${T.border}`, borderRadius:'16px 16px 0 0',
        padding:18, width:'100%', maxWidth:560, maxHeight:'85vh', overflowY:'auto',
        fontFamily:'DM Sans, system-ui, sans-serif',
      }}>
        <h2 style={{ fontSize:19, fontWeight:900, margin:'0 0 4px', color:T.text }}>
          Check round {round.index} before moving on
        </h2>
        <p style={{ color:T.muted, fontSize:13, margin:'0 0 14px' }}>
          These results set everyone&apos;s rating and decide the next draw. A reversed
          score here is hard to spot later.
        </p>
        <div style={{ display:'grid', gap:8, marginBottom:16 }}>
          {round.matches.map((m: any) => {
            const r = session.results.find((x: any) => x.round === round.index && x.court === m.court)
            if (!r) return null
            const aWon = r.scoreA > r.scoreB
            const win = aWon ? m.teamA : m.teamB
            const lose = aWon ? m.teamB : m.teamA
            return (
              <div key={m.court} style={{ background:T.card2, border:`1px solid ${T.border}`,
                borderRadius:10, padding:'11px 12px', fontSize:14, color:T.text }}>
                <div style={{ fontSize:11, color:T.muted, marginBottom:3 }}>Court {m.court}</div>
                <strong style={{ color:T.accent }}>{nm(win.a)} &amp; {nm(win.b)}</strong> beat{' '}
                {nm(lose.a)} &amp; {nm(lose.b)}
                <strong style={{ marginLeft:6 }}>
                  {Math.max(r.scoreA, r.scoreB)}–{Math.min(r.scoreA, r.scoreB)}
                </strong>
              </div>
            )
          })}
        </div>
        <div style={{ display:'grid', gap:8 }}>
          <button style={{ ...btn('primary'), padding:'14px', fontSize:15 }} onClick={onConfirm}>
            All correct — generate next round
          </button>
          <button style={{ ...btn(), padding:'12px' }} onClick={onCancel}>
            Go back and fix a score
          </button>
        </div>
      </div>
    </div>
  )
}

function SessionQr({ sessionId, origin }: { sessionId: string; origin: string }) {
  const [svg, setSvg] = useState('')
  const [permanent, setPermanent] = useState(true)
  const url = permanent ? `${origin}/live/latest` : `${origin}/live/${sessionId}/join`
  useEffect(() => {
    let off = false
    import('qrcode').then(async QR => {
      const out = await QR.toString(url, { type:'svg', errorCorrectionLevel:'M', margin:2, width:300 })
      if (!off) setSvg(out)
    })
    return () => { off = true }
  }, [url])
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <h2 style={{ fontSize:15, margin:'0 0 4px' }}>Session QR code</h2>
      <p style={{ color:T.muted, fontSize:13, margin:'0 0 12px' }}>
        One code for everyone. Players enter their name and level themselves.
      </p>
      <div style={{ background:'#fff', borderRadius:10, padding:8, lineHeight:0, marginBottom:10 }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      <label style={{ display:'flex', gap:8, alignItems:'flex-start', cursor:'pointer', marginBottom:10 }}>
        <input type="checkbox" checked={permanent} onChange={e => setPermanent(e.target.checked)} style={{ marginTop:3 }} />
        <span style={{ fontSize:13 }}>
          <strong>Reusable code</strong>
          <span style={{ display:'block', color:T.muted, marginTop:2 }}>
            Points at /live/latest — always the current session. Print once, use every week.
          </span>
        </span>
      </label>
      <div style={{ fontSize:11, color:T.muted, wordBreak:'break-all', marginBottom:8 }}>{url}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <button style={btn()} onClick={() => navigator.clipboard?.writeText(url)}>Copy link</button>
        <button style={btn()} onClick={() => window.print()}>Print</button>
      </div>
    </section>
  )
}

function RosterPanel({ session, busy, onAdd, onLevel, onRemove }: any) {
  const [newName, setNewName] = useState('')
  const [newLevel, setNewLevel] = useState<string>('standard')
  const players = Object.values(session.players as Record<string, any>)
    .sort((a, b) => a.name.localeCompare(b.name))
  const round = session.rounds[session.rounds.length - 1]
  const onCourt = (pid: string) => round
    ? round.matches.some((m: any) => [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].includes(pid))
    : false

  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <h2 style={{ fontSize:15, margin:'0 0 4px' }}>Roster · {players.length} players</h2>
      <p style={{ color:T.muted, fontSize:13, margin:'0 0 12px' }}>
        Changing a level recomputes every rating from the scores, so a correction
        applies retroactively.
      </p>
      <div style={{ display:'grid', gap:8, marginBottom:14 }}>
        <input style={inp()} placeholder="Add a player…" value={newName}
          onChange={e => setNewName(e.target.value)} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
          <select style={inp()} value={newLevel} onChange={e => setNewLevel(e.target.value)}>
            {LEVELS.map(l => <option key={l} value={l}>{l[0].toUpperCase()+l.slice(1)}</option>)}
          </select>
          <button style={btn('primary')} disabled={busy || !newName.trim()}
            onClick={() => { onAdd(newName, newLevel); setNewName('') }}>Add</button>
        </div>
      </div>
      <div style={{ display:'grid', gap:6 }}>
        {players.map((p: any) => (
          <div key={p.id} style={{ background:T.card2, border:`1px solid ${T.border}`,
            borderRadius:10, padding:'9px 11px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
              <span style={{ flex:1, fontSize:15, fontWeight:700 }}>{p.name}</span>
              <span style={{ fontSize:12, color:T.muted }}>{Math.round(p.rating)}</span>
              {onCourt(p.id) && <span style={{ color:T.accent, fontSize:11 }}>on court</span>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
              <select style={inp({ padding:'7px 9px', fontSize:13 })} value={p.level} disabled={busy}
                onChange={e => onLevel(p.id, e.target.value)}>
                {LEVELS.map(l => <option key={l} value={l}>{l[0].toUpperCase()+l.slice(1)}</option>)}
              </select>
              <button style={{ ...btn('danger'), padding:'7px 12px', fontSize:13 }}
                disabled={busy || onCourt(p.id)}
                title={onCourt(p.id) ? 'On court — swap them out or undo the round first' : 'Remove'}
                onClick={() => { if (confirm(`Remove ${p.name}?`)) onRemove(p.id) }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function TuningPanel({ config, onApply, busy }: {
  config: Config; onApply: (c: Config) => void; busy: boolean
}) {
  const [k, setK] = useState(config.rating.kSchedule.join(','))
  const [start, setStart] = useState(LEVELS.map(l => config.rating.start[l as Level]).join(','))
  const [clip, setClip] = useState(config.rating.clip.join(','))
  const [promo, setPromo] = useState(String(config.rating.promotionRounds))
  const [cap, setCap] = useState(config.rotation.movementCap == null ? '' : String(config.rotation.movementCap))
  const [begCourts, setBegCourts] = useState(config.rotation.beginnerCourts.join(','))
  const [cost, setCost] = useState([config.rotation.cost.repeatPartner, config.rotation.cost.repeatOpponent, config.rotation.cost.per100Gap].join(','))
  const [swb, setSwb] = useState(String(config.rotation.cost.strongWithBeginner ?? 6))
  const [svb, setSvb] = useState(String(config.rotation.cost.strongVsBeginner ?? 2))
  const [spread, setSpread] = useState(String(config.rotation.maxCourtSpread))
  const nums = (s: string) => s.split(',').map(x => Number(x.trim())).filter(n => !Number.isNaN(n))

  const apply = () => {
    const [b, st, im, sg] = nums(start)
    const [cl, ch] = nums(clip)
    const [rp, ro, pg] = nums(cost)
    onApply({
      ...config,
      rating: { ...config.rating, kSchedule: nums(k),
        start: { beginner:b, standard:st, intermediate:im, strong:sg },
        clip: [cl, ch], promotionRounds: Number(promo) },
      rotation: { ...config.rotation,
        movementCap: cap.trim() === '' ? null : Number(cap),
        beginnerCourts: nums(begCourts),
        cost: { repeatPartner: rp, repeatOpponent: ro, per100Gap: pg,
          strongWithBeginner: Number(swb), strongVsBeginner: Number(svb) },
        maxCourtSpread: Number(spread) },
    })
  }

  const Field = ({ label, value, set }: { label: string; value: string; set: (v: string) => void }) => (
    <label style={{ display:'block', marginBottom:9 }}>
      <span style={{ fontSize:11, color:T.muted, display:'block', marginBottom:3 }}>{label}</span>
      <input style={inp({ padding:'8px 10px', fontSize:13 })} value={value} onChange={e => set(e.target.value)} />
    </label>
  )

  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <details>
        <summary style={{ cursor:'pointer', fontSize:15, fontWeight:700 }}>Tuning</summary>
        <div style={{ marginTop:12 }}>
          <Field label="K schedule (games 1,2,3,4,5+)" value={k} set={setK} />
          <Field label="Start: beginner / standard / intermediate / strong" value={start} set={setStart} />
          <Field label="Expected-share clip" value={clip} set={setClip} />
          <Field label="Promotion rounds above median" value={promo} set={setPromo} />
          <Field label="Movement cap (blank = none)" value={cap} set={setCap} />
          <Field label="Beginner courts" value={begCourts} set={setBegCourts} />
          <Field label="Cost: repeat partner / repeat opponent / per 100 pts" value={cost} set={setCost} />
          <Field label="Cost: strong paired with beginner" value={swb} set={setSwb} />
          <Field label="Cost: strong facing beginner" value={svb} set={setSvb} />
          <Field label="Max court spread for swaps" value={spread} set={setSpread} />
          <button style={{ ...btn('primary'), width:'100%' }} disabled={busy} onClick={apply}>
            Apply &amp; recompute
          </button>
        </div>
      </details>
    </section>
  )
}
