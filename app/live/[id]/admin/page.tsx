'use client'
import { use, useState, useMemo, useEffect } from 'react'
import { useLiveSession } from '../../_hooks/useLiveSession'
import { T, inp, cardStyle, btn } from '../../_components/theme'
import { FormBadges } from '../../_components/Form'
import { RoundTimer } from '../../_components/RoundTimer'
import { ScoreCard } from './ScoreCard'
import { RosterEditor } from './RosterEditor'
import { ScoreLog, PastGames, LogRow } from './ScoreLog'
import { Attention } from './Attention'
import { LeaveSheet, StartLevelSheet, PlayerAccessSheet } from './Sheets'
import { sharePlayerLink } from './RosterEditor'
import { standings, grandFinal, roundComplete } from '@/lib/live-session/engine'
import type { Config, Level } from '@/lib/live-session/engine'
import { LEVEL_INFO, LEVELS } from '@/lib/live-session/levels'
import { displayNames } from '@/lib/live-session/displayNames'
import { staffHeaders, whoAmI } from '@/lib/staffClient'
import { StaffGate as Gate } from '../../_components/StaffGate'

type Tab = 'courts' | 'standings' | 'roster' | 'log' | 'settings'
const SLOTS = ['A.a', 'A.b', 'B.a', 'B.b'] as const

export default function LiveAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const { session, meta, error, loading, refetch, isAdmin, history, offset } =
    useLiveSession(id, authed ? secret : undefined, authed)
  const [leaving, setLeaving] = useState<any>(null)
  const [startFix, setStartFix] = useState<any>(null)
  const [access, setAccess] = useState<{ p: any; pin?: string | null } | null>(null)
  const [tab, setTab] = useState<Tab>('courts')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [review, setReview] = useState(false)
  const [log, setLog] = useState<LogRow[]>([])
  const [logUnavailable, setLogUnavailable] = useState<string | null>(null)

  // Signed in with a staff account? Straight in. Otherwise the emergency
  // password, if one was typed in this tab.
  useEffect(() => {
    const s = sessionStorage.getItem('tss-admin-secret')
    if (s) { setSecret(s); setAuthed(true); return }
    whoAmI().then((w) => { if (w) setAuthed(true) })
  }, [])

  // During registration, also poll: realtime is the fast path, this is the
  // safety net if a websocket drops on a phone.
  useEffect(() => {
    if (!authed || meta?.status !== 'setup') return
    const t = setInterval(() => refetch(), 4000)
    return () => clearInterval(t)
  }, [authed, meta?.status, refetch])

  useEffect(() => {
    if (!authed || isAdmin !== true) return
    fetch(`/api/live/${id}/log`, { headers: { ...staffHeaders(secret) }, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { setLog(j.log ?? []); setLogUnavailable(j.unavailable ?? null) })
      .catch(() => {})
  }, [authed, isAdmin, id, secret, session])

  const call = async (path: string, init: RequestInit = {}): Promise<any> => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(path, {
        ...init,
        headers: { 'Content-Type':'application/json', ...staffHeaders(secret), ...(init.headers ?? {}) },
      })
      const json = await res.json().catch(() => ({}))
      // A change that breaks a rule (e.g. Strong + beginner on one court) is
      // refused once with a question; confirming resends it with force.
      if (res.status === 409 && json.needsConfirm && typeof init.body === 'string') {
        setBusy(false)
        if (!confirm(json.error)) return null
        return call(path, { ...init, body: JSON.stringify({ ...JSON.parse(init.body), force: true }) })
      }
      if (!res.ok) { setMsg(json.error ?? `Failed (${res.status})`); return null }
      await refetch()
      return json
    } finally { setBusy(false) }
  }
  const post = (sub: string, body: unknown, method = 'POST') =>
    call(`/api/live/${id}${sub}`, { method, body: JSON.stringify(body) })
  const playerUrl = (pid: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/live/${id}/player/${pid}`
  const shareControls = {
    onQr: (p: any) => setAccess({ p }),
    onLink: async (p: any) => {
      if (p.accountId) {
        if (confirm(`Unlink ${p.name} from their TSS account? This session will leave their history.`))
          await post('/players', { player_id: p.id, unlink: true }, 'PATCH')
        return
      }
      const email = prompt(`Link ${p.name} to a TSS account.\n\nTheir sign-in email (they must have signed in once at My TSS):`)
      if (email?.trim()) {
        const r = await post('/players', { player_id: p.id, linkEmail: email.trim() }, 'PATCH')
        if (r?.linked) alert(`${p.name} is linked. This session now shows in their My games.`)
      }
    },
    onNewPin: async (p: any) => {
      const r = await post('/players', { player_id: p.id, newPin: true }, 'PATCH')
      if (r?.pin) setAccess({ p, pin: r.pin })
    },
  }
  const finish = () => { if (confirm('Finish this session? Registration closes and the QR code stops opening it.')) post('', { status: 'finished' }, 'PATCH') }

  const round = session?.rounds[session.rounds.length - 1]
  const finalAt = (session?.config as any)?.finalRound as number | undefined
  const inFinal = !!finalAt && !!round && round.index >= finalAt
  const complete = session && round ? roundComplete(session, round.index) : false
  const gone = useMemo(() => new Set<string>(((session?.config as any)?.withdrawn as string[]) ?? []), [session])
  // Never let the standings take the whole admin page down: if the data is
  // ever inconsistent, show a message in that panel instead of a blank page.
  const { table, tableError } = useMemo(() => {
    if (!session) return { table: [], tableError: null as string | null }
    try { return { table: standings(session.players, session.results, session.config.finals), tableError: null } }
    catch (e) { return { table: [], tableError: (e as Error).message } }
  }, [session])
  const finalScored = !!finalAt && !!session?.results.some((r) => r.round === finalAt)
  const final = useMemo(() => {
    if (!table.length || !session) return null
    try { return grandFinal(table.filter((t) => !gone.has(t.id)), session.config.finals) } catch { return null }
  }, [table, session, gone])

  if (!authed) return <Gate secret={secret} setSecret={setSecret} setAuthed={setAuthed} />
  if (loading) return <Centre>Loading…</Centre>
  if (error || !session) return <Centre colour={T.danger}>{error}</Centre>
  if (isAdmin === false) return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'grid', placeItems:'center',
      fontFamily:'DM Sans, system-ui, sans-serif', padding:20 }}>
      <div style={{ ...cardStyle, padding:24, maxWidth:340, textAlign:'center' }}>
        <div style={{ color:T.danger, fontSize:16, fontWeight:700, marginBottom:6 }}>
          No access to this session
        </div>
        <div style={{ color:T.muted, fontSize:13 }}>
          Sign in with a staff account that runs this session, or ask an owner to assign it to you.
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
    { id:'log', label:'Log' },
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
          <h1 style={{ fontSize:20, fontWeight:900, margin:0 }}>{meta?.name ?? 'Live session'}</h1>
          <a href={`/live/${id}/board`} target="_blank" rel="noreferrer"
            style={{ color:T.muted, fontSize:13, textDecoration:'none' }}>Board ↗</a>
        </div>
        <div style={{ color:T.muted, fontSize:13, marginTop:2 }}>
          {Object.keys(session.players).length - gone.size} players · {session.config.rotation.courts} courts
          {gone.size > 0 && ` · ${gone.size} left`}
          {round && ` · round ${round.index}`}
          {meta && (
            <span style={{ marginLeft:8, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
              color: meta.registrationOpen ? T.accent : T.muted,
              border:`1px solid ${meta.registrationOpen ? T.accentBorder : T.border}` }}>
              registration {meta.registrationOpen ? 'open' : 'closed'}
            </span>
          )}
        </div>
      </div>

      {meta?.status === 'setup' && (
        <RegistrationView
          id={id} origin={origin} session={session} meta={meta} busy={busy} msg={msg}
          onToggle={(open: boolean) => call(`/api/live/${id}`, { method:'PATCH', body: JSON.stringify({ registrationOpen: open }) })}
          onAdd={(name: string, level: string) => call(`/api/live/${id}/players`, { method:'POST', body: JSON.stringify({ name, level }) })}
          onRename={(pid: string, name: string) => call(`/api/live/${id}/players`, { method:'PATCH', body: JSON.stringify({ player_id: pid, name }) })}
          onLevel={(pid: string, level: string) => call(`/api/live/${id}/players`, { method:'PATCH', body: JSON.stringify({ player_id: pid, level }) })}
          onRemove={(pid: string) => call(`/api/live/${id}/players?player_id=${pid}`, { method:'DELETE' })}
          onStart={async () => { const ok = await call(`/api/live/${id}`, { method:'PATCH', body: JSON.stringify({ status:'live' }) }); if (ok) setTab('courts') }}
          share={shareControls}
          playerLink={playerUrl}
          onUseLatest={() => { if (confirm('Switch this session to the latest default settings?')) post('', { useLatest: true }, 'PATCH') }}
          history={history}
        />
      )}

      {meta?.status !== 'setup' && <>
      {/* tabs */}
      <div style={{
        display:'flex', gap:4, padding:'12px 14px 0', maxWidth:760, margin:'0 auto',
        position:'sticky', top:0, background:T.bg, zIndex:5, overflowX:'auto',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            // Five tabs must fit a 375px-wide phone without sideways scrolling.
            flex:'1 1 0', minWidth:0, padding:'12px 4px', fontSize:13, fontWeight:700,
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

        {meta?.status === 'finished' && (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px',
            marginBottom:12, fontSize:14, display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ flex:1 }}><strong>Session finished.</strong> Registration is closed and the QR code no longer opens it. You can still correct scores and who played.</span>
            <button style={{ ...btn(), minHeight:44 }} disabled={busy}
              onClick={() => { if (confirm('Reopen this session?')) post('', { status: 'live' }, 'PATCH') }}>Reopen</button>
          </div>
        )}

        {meta && (
          <Attention session={session} meta={meta} busy={busy} nm={nm} gone={gone}
            post={(b) => post('/attention', b)}
            patchPlayer={(b) => post('/players', b, 'PATCH')}
            onFinish={finish} />
        )}

        {/* ── COURTS ───────────────────────────────────────────── */}
        {tab === 'courts' && (
          <>
            <div style={{ marginBottom:12 }}>
              <RoundTimer mode="admin" timer={round?.timer} round={round?.index} offset={offset}
                onAction={async (a) => {
                  const res = await fetch(`/api/live/${id}/timer`, { method:'POST',
                    headers: { 'Content-Type':'application/json', ...staffHeaders(secret) }, body: JSON.stringify(a) })
                  const j = await res.json().catch(() => ({}))
                  if (!res.ok) setMsg(j.error ?? 'Timer failed'); else refetch()
                }} />
            </div>

            {round ? (
              <div style={{ display:'grid', gap:10 }}>
                {round.matches.map(m => (
                  <div key={m.court}>
                    <ScoreCard match={m} players={session.players as any}
                      existing={scoreOf(m.court)} busy={busy}
                      edits={log.filter((l) => l.event === 'score' && l.round === round.index && l.court === m.court && l.old_a != null).length}
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
                              {Object.values(session.players).filter((p: any) => !gone.has(p.id)).map((p: any) =>
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

            {inFinal && !finalScored && (
              <div style={{ marginTop:14, background:T.card, border:`1px solid ${T.warning}`, borderRadius:12,
                padding:'12px 14px', fontSize:14 }}>
                🏆 <strong>Grand final in progress.</strong> Enter its score, then finish the session.
                Undo the round if the final was drawn by mistake.
              </div>
            )}
            {finalScored && meta?.status === 'live' && (
              <button style={{ ...btn('primary'), width:'100%', marginTop:14, padding:'18px', fontSize:17, fontWeight:800 }}
                disabled={busy} onClick={finish}>
                🏁 Finish session
              </button>
            )}

            {/* actions */}
            <div style={{ display:'grid', gap:8, marginTop:16 }}>
              {!inFinal && <button style={{ ...btn('primary'), padding:'14px', fontSize:15 }}
                disabled={busy || (!!round && !complete)}
                onClick={() => { if (round) setReview(true); else call(`/api/live/${id}/round`, { method:'POST' }) }}>
                {round ? 'Review scores & generate next round' : 'Generate first round'}
              </button>}
              {round && !complete && !inFinal && (
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
              {!inFinal && <button style={{ ...btn(), borderColor:T.warning, color:T.warning }}
                disabled={busy || (!!round && !complete)}
                onClick={() => {
                  if (confirm('Generate the GRAND FINAL? This ends the normal rounds.'))
                    call(`/api/live/${id}/final`, { method:'POST' })
                }}>
                🏆 Generate grand final
              </button>}
            </div>
          </>
        )}

        {/* ── STANDINGS ────────────────────────────────────────── */}
        {tab === 'standings' && (
          <>
            <section style={{ ...cardStyle, padding:14 }}>
              <h2 style={{ fontSize:15, margin:'0 0 10px' }}>Standings</h2>
              {tableError && <p style={{ color:T.warning, fontSize:13 }}>Standings unavailable: {tableError}</p>}
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
                        <td style={{ padding:'7px 6px', fontWeight:600, color: gone.has(s.id) ? T.muted : T.text }}>
                          {s.name}{gone.has(s.id) && <span style={{ fontWeight:400, fontSize:11 }}> · left</span>}</td>
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

        {/* ── LOG ──────────────────────────────────────────────── */}
        {tab === 'log' && (
          <>
            <ScoreLog log={log} unavailable={logUnavailable} />
            <PastGames session={session} nm={nm} busy={busy}
              onSwap={(round, court, slot, pid) => post('/override', { round, court, slot, player_id: pid })}
              onUnknown={(round, court, pid, on) => post('/override', { round, court, player_id: pid, unknown: on })} />
          </>
        )}

        {/* ── ROSTER ───────────────────────────────────────────── */}
        {tab === 'roster' && (
          <section style={{ ...cardStyle, padding:14 }}>
            <h2 style={{ fontSize:15, margin:'0 0 10px' }}>Roster</h2>
            <RosterEditor
              players={Object.values(session.players).filter((p: any) => !gone.has(p.id)) as any}
              onCourtIds={new Set(round ? round.matches.flatMap((m) => [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b]) : [])}
              busy={busy}
              onAdd={(name, level) => call(`/api/live/${id}/players`, { method:'POST', body: JSON.stringify({ name, level }) })}
              onRename={(pid, name) => call(`/api/live/${id}/players`, { method:'PATCH', body: JSON.stringify({ player_id: pid, name }) })}
              onLevel={(pid, level) => call(`/api/live/${id}/players`, { method:'PATCH', body: JSON.stringify({ player_id: pid, level }) })}
              onRemove={(pid) => call(`/api/live/${id}/players?player_id=${pid}`, { method:'DELETE' })}
              playerLink={(pid) => `${origin}/live/${id}/player/${pid}`}
              history={history}
              share={shareControls}
              live={{
                nextRound: session.rounds.length + 1,
                onLeave: (p) => setLeaving(p),
                onLock: (pid, locked) => post('/players', { player_id: pid, locked }, 'PATCH'),
                onStartLevel: (p) => setStartFix(p),
              }} />
            {gone.size > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:12, color:T.muted, marginBottom:6 }}>
                  Left the session — their games still count, they won&apos;t be drawn again
                </div>
                {Object.values(session.players).filter((p: any) => gone.has(p.id)).map((p: any) => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
                    background:T.card2, border:`1px solid ${T.border}`, borderRadius:10, marginBottom:6 }}>
                    <span style={{ flex:1, color:T.muted }}>{p.name}</span>
                    <button style={{ ...btn(), padding:'5px 10px', fontSize:12 }} disabled={busy}
                      onClick={() => call(`/api/live/${id}/players`, { method:'PATCH', body: JSON.stringify({ player_id: p.id, rejoin: true }) })}>
                      Bring back</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── SETTINGS ─────────────────────────────────────────── */}
        {tab === 'settings' && (
          <>
            <RegistrationToggle open={!!meta?.registrationOpen} busy={busy}
              onToggle={(open) => call(`/api/live/${id}`, { method:'PATCH', body: JSON.stringify({ registrationOpen: open }) })} />
            <SessionQr sessionId={id} origin={origin} />
            <ConfigVersion meta={meta} />
            <TuningPanel config={session.config} busy={busy}
              onApply={cfg => call(`/api/live/${id}`, { method:'PATCH', body: JSON.stringify({ config: cfg }) })} />
            <section style={{ ...cardStyle, padding:14 }}>
              <h2 style={{ fontSize:15, margin:'0 0 8px' }}>End session</h2>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 10px' }}>
                Closes registration so the printed QR stops pointing at it. A session still open 6 hours after its last
                score finishes itself.
              </p>
              {meta?.status === 'finished'
                ? <button style={{ ...btn(), width:'100%', minHeight:44 }} disabled={busy}
                    onClick={() => { if (confirm('Reopen this session?')) post('', { status: 'live' }, 'PATCH') }}>Reopen session</button>
                : <button style={{ ...btn('danger'), width:'100%', minHeight:44 }} disabled={busy} onClick={finish}>Finish session</button>}
            </section>
          </>
        )}
      </div>

      </>}

      {leaving && (
        <LeaveSheet leaver={leaving} busy={busy}
          onCourt={!!round && round.matches.some((m) => [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].includes(leaving.id))
            && !session.results.some((r) => r.round === round.index && [r.teamA.a, r.teamA.b, r.teamB.a, r.teamB.b].includes(leaving.id))}
          candidates={Object.values(session.players).filter((p: any) => p.id !== leaving.id && !gone.has(p.id))
            .sort((a: any, b: any) => a.name.localeCompare(b.name)) as any}
          onClose={() => setLeaving(null)}
          onConfirm={async (substitute) => {
            const ok = await post('/players', { player_id: leaving.id, leave: true, substitute }, 'PATCH')
            if (ok) setLeaving(null)
          }} />
      )}
      {access && (
        <PlayerAccessSheet name={access.p.name} url={playerUrl(access.p.id)} pin={access.pin}
          onClose={() => setAccess(null)} onShare={() => sharePlayerLink(access.p.name, playerUrl(access.p.id))} />
      )}
      {startFix && (
        <StartLevelSheet player={startFix} busy={busy} onClose={() => setStartFix(null)}
          preview={async (level) => {
            const res = await fetch(`/api/live/${id}/players`, { method:'PATCH', cache:'no-store',
              headers: { 'Content-Type':'application/json', ...staffHeaders(secret) },
              body: JSON.stringify({ player_id: startFix.id, start_level: level, preview: true }) })
            return res.ok ? res.json() : null
          }}
          apply={async (level) => {
            const ok = await post('/players', { player_id: startFix.id, start_level: level }, 'PATCH')
            if (ok) setStartFix(null)
          }} />
      )}

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
            const drawn = r.scoreA === r.scoreB
            const aWon = r.scoreA > r.scoreB
            const win = aWon ? m.teamA : m.teamB
            const lose = aWon ? m.teamB : m.teamA
            return (
              <div key={m.court} style={{ background:T.card2, border:`1px solid ${drawn ? T.warning : T.border}`,
                borderRadius:10, padding:'11px 12px', fontSize:14, color:T.text }}>
                <div style={{ fontSize:11, color:T.muted, marginBottom:3 }}>Court {m.court}</div>
                {drawn ? (
                  <>{nm(m.teamA.a)} &amp; {nm(m.teamA.b)} <strong style={{ color:T.warning }}>drew with</strong>{' '}
                  {nm(m.teamB.a)} &amp; {nm(m.teamB.b)}</>
                ) : (
                  <><strong style={{ color:T.accent }}>{nm(win.a)} &amp; {nm(win.b)}</strong> beat{' '}
                  {nm(lose.a)} &amp; {nm(lose.b)}</>
                )}
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

function TuningPanel({ config, onApply, busy }: {
  config: Config; onApply: (c: any) => void; busy: boolean
}) {
  const [k, setK] = useState(config.rating.kSchedule.join(','))
  const [start, setStart] = useState(LEVELS.map(l => config.rating.start[l as Level]).join(','))
  const [clip, setClip] = useState(config.rating.clip.join(','))
  const r = config.rotation, lv = config.levels
  const [swapDist, setSwapDist] = useState(r.maxSwapDistance == null ? '' : String(r.maxSwapDistance))
  const [swapGap, setSwapGap] = useState(r.maxSwapGapIncrease == null ? '' : String(r.maxSwapGapIncrease))
  const [lone, setLone] = useState(!!r.loneBeginnerPairing)
  const [auto, setAuto] = useState(!!lv.autoApply)
  const [review, setReview] = useState([lv.minGames, lv.roundsInBand, lv.hysteresis].join(','))
  const [mis, setMis] = useState([lv.mismatchMargin, lv.mismatchShare].join(','))
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
    const [mg, rib, hy] = nums(review)
    const [mm, ms] = nums(mis)
    // Only the settings on this panel are sent; the server rebuilds the rest
    // from its defaults (lib/live-session/config.ts).
    onApply({
      courts: config.rotation.courts,
      rating: { kSchedule: nums(k),
        start: { beginner:b, standard:st, intermediate:im, strong:sg },
        clip: [cl, ch] },
      rotation: {
        movementCap: cap.trim() === '' ? null : Number(cap),
        beginnerCourts: nums(begCourts),
        cost: { repeatPartner: rp, repeatOpponent: ro, per100Gap: pg,
          strongWithBeginner: Number(swb), strongVsBeginner: Number(svb) },
        maxCourtSpread: Number(spread),
        maxSwapDistance: swapDist.trim() === '' ? null : Number(swapDist),
        maxSwapGapIncrease: swapGap.trim() === '' ? null : Number(swapGap),
        loneBeginnerPairing: lone },
      levels: { autoApply: auto, minGames: mg, roundsInBand: rib, hysteresis: hy, mismatchMargin: mm, mismatchShare: ms },
    } as any)
  }

  const Field = ({ label, value, set }: { label: string; value: string; set: (v: string) => void }) => (
    <label style={{ display:'block', marginBottom:9 }}>
      <span style={{ fontSize:11, color:T.muted, display:'block', marginBottom:3 }}>{label}</span>
      <input style={inp({ padding:'8px 10px', fontSize:13 })} value={value} onChange={e => set(e.target.value)} />
    </label>
  )

  const Check = ({ label, value, set }: { label: string; value: boolean; set: (v: boolean) => void }) => (
    <label style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:10, cursor:'pointer', fontSize:13 }}>
      <input type="checkbox" checked={value} onChange={e => set(e.target.checked)} style={{ marginTop:2, width:18, height:18 }} />
      <span>{label}</span>
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
          <Field label="Movement cap (blank = none)" value={cap} set={setCap} />
          <Field label="Beginner courts" value={begCourts} set={setBegCourts} />
          <Field label="Cost: repeat partner / repeat opponent / per 100 pts" value={cost} set={setCost} />
          <Field label="Cost: strong paired with beginner" value={swb} set={setSwb} />
          <Field label="Cost: strong facing beginner" value={svb} set={setSvb} />
          <Field label="Max court spread for swaps" value={spread} set={setSpread} />
          <Field label="Swaps: furthest from rating block, in courts (blank = no limit)" value={swapDist} set={setSwapDist} />
          <Field label="Swaps: max team-gap increase, rating points (blank = no limit)" value={swapGap} set={setSwapGap} />
          <Check label="Lone beginner partners the best non-Strong player on court" value={lone} set={setLone} />
          <div style={{ fontSize:12, fontWeight:800, color:T.muted, margin:'14px 0 8px' }}>LEVEL REVIEW</div>
          <Check label="Move levels automatically (off = suggest only; moves down to Beginner always apply)" value={auto} set={setAuto} />
          <Field label="Min games / rounds in the other band / points inside it" value={review} set={setReview} />
          <Field label="Flag a game: margin of / point share off by" value={mis} set={setMis} />
          <button style={{ ...btn('primary'), width:'100%' }} disabled={busy} onClick={apply}>
            Apply &amp; recompute
          </button>
        </div>
      </details>
    </section>
  )
}


/** Which default settings this session was built from. */
function ConfigVersion({ meta, onUseLatest, busy }: { meta: any; onUseLatest?: () => void; busy?: boolean }) {
  if (!meta?.latestConfigVersion) return null
  const v = meta.configVersion as number | null
  const current = v === meta.latestConfigVersion
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ flex:1, fontSize:13 }}>
          <strong style={{ fontSize:15 }}>Settings v{v ?? 1}</strong>
          <span style={{ color: current ? T.muted : T.warning, display:'block', marginTop:2 }}>
            {current ? 'Latest defaults.' : `Older than the latest defaults (v${meta.latestConfigVersion}).`}
          </span>
        </div>
        {!current && onUseLatest && (
          <button style={{ ...btn('primary'), minHeight:44 }} disabled={busy} onClick={onUseLatest}>Use latest settings</button>
        )}
      </div>
    </section>
  )
}

function RegistrationToggle({ open, busy, onToggle }: { open: boolean; busy: boolean; onToggle: (open: boolean) => void }) {
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700 }}>Registration {open ? 'open' : 'closed'}</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
            {open ? 'Anyone with the QR code can add themselves.' : 'The QR code shows “registration closed”. You can still add people here.'}
          </div>
        </div>
        <button style={btn(open ? 'danger' : 'primary')} disabled={busy} onClick={() => onToggle(!open)}>
          {open ? 'Close' : 'Open'}
        </button>
      </div>
    </section>
  )
}

/** Shown while the session is in 'setup': live registrations, then Start. */
function RegistrationView({ id, origin, session, meta, busy, msg, onToggle, onAdd, onRename, onLevel, onRemove, onStart, onUseLatest, history, share, playerLink }: any) {
  const n = Object.keys(session.players).length
  const courts = session.config.rotation.courts
  return (
    <div style={{ padding:'14px', maxWidth:760, margin:'0 auto' }}>
      {msg && <div style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, color:T.danger,
        padding:'10px 14px', borderRadius:8, marginBottom:12, fontSize:14 }}>{msg}</div>}
      <RegistrationToggle open={meta.registrationOpen} busy={busy} onToggle={onToggle} />
      <ConfigVersion meta={meta} onUseLatest={onUseLatest} busy={busy} />
      <SessionQr sessionId={id} origin={origin} />
      <section style={{ ...cardStyle, padding:14 }}>
        <h2 style={{ fontSize:15, margin:'0 0 10px' }}>Players</h2>
        <RosterEditor players={Object.values(session.players).filter((p: any) => !(((session.config as any)?.withdrawn ?? []) as string[]).includes(p.id)) as any} onCourtIds={new Set()} busy={busy} arrivalOrder history={history} share={share} playerLink={playerLink}
          onAdd={onAdd} onRename={onRename} onLevel={onLevel} onRemove={onRemove} />
      </section>
      <button style={{ ...btn('primary'), width:'100%', padding:'15px', fontSize:16 }}
        disabled={busy || n < 4}
        onClick={() => { if (confirm(`Start the session with ${n} players?`)) onStart() }}>
        {n < 4 ? `Need at least 4 players (${n} so far)` : `Start session with ${n} players`}
      </button>
      {n >= 4 && n < courts * 4 && (
        <p style={{ color:T.muted, fontSize:12, textAlign:'center', marginTop:8 }}>
          {n} players fills {Math.floor(n / 4)} of {courts} courts; {n % 4} will sit out each round.
        </p>
      )}
    </div>
  )
}
