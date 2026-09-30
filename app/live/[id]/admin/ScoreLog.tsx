'use client'
import { useState } from 'react'
import { T, cardStyle, btn, inp } from '@/app/_design/theme'
import { describe } from '@/lib/live-session/changeLog'
import type { LogRow as ChangeRow } from '@/lib/live-session/changeLog'
import type { Session } from '@/lib/live-session/engine'

export type LogRow = ChangeRow & { id: string; created_at: string }

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })

/**
 * The change log: every score entered or corrected, undone round, swap,
 * level change (by an admin or the automatic review), leaver, substitute,
 * registration and finish — one plain-English line each, newest first.
 */
export function ScoreLog({ log, unavailable }: { log: LogRow[]; unavailable: string | null }) {
  const [filter, setFilter] = useState<'all' | 'scores' | 'changes'>('all')
  const rows = log.filter((r) => filter === 'all' || (filter === 'scores') === (r.event === 'score'))
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <h2 style={{ fontSize:15, margin:'0 0 4px' }}>Change log</h2>
      <p style={{ color:T.muted, fontSize:12, margin:'0 0 10px' }}>
        Everything that changed tonight and who did it, so a disputed result or a surprise draw can be traced.
      </p>
      <div role="tablist" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:10 }}>
        {(['all', 'scores', 'changes'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            style={{ ...btn(filter === f ? 'primary' : 'ghost'), padding:'9px 6px', minHeight:40 }}>
            {f === 'all' ? 'All' : f === 'scores' ? 'Scores' : 'Other changes'}
          </button>
        ))}
      </div>
      {unavailable ? (
        <p style={{ color:T.warning, fontSize:13, margin:0 }}>
          Not recording — run migration 011 in Supabase. Scores still save normally.
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color:T.muted, fontSize:13, margin:0 }}>Nothing yet.</p>
      ) : (
        <div style={{ display:'grid', gap:5 }}>
          {rows.map((r) => {
            const d = describe(r)
            const teams = r.detail?.teamA && r.detail?.teamB
              ? `${r.detail.teamA.join(' & ')} v ${r.detail.teamB.join(' & ')}` : ''
            const edited = r.event === 'score' && r.old_a != null
            return (
              <div key={r.id} style={{ background:T.card2, border:`1px solid ${edited ? T.warning : T.border}`,
                borderRadius:8, padding:'8px 10px', fontSize:13 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                  <span><span style={{ color:T.muted }}>{d.when} · {d.who} ·</span> {d.what}</span>
                  <span style={{ color:T.muted, fontSize:11, whiteSpace:'nowrap' }}>{time(r.created_at)}</span>
                </div>
                {teams && <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>{teams}</div>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const SLOTS = ['A.a', 'A.b', 'B.a', 'B.b'] as const

/**
 * Every game so far, with the two corrections for substitutes:
 *  - "Played by someone else": the result and its rating change move to the
 *    person who really played (the Swap players logic, on any round).
 *  - "Unknown substitute": the game stays in the draw history but stops
 *    counting for the named player's rating.
 */
export function PastGames({ session, nm, busy, onSwap, onUnknown }: {
  session: Session
  nm: (id: string) => string
  busy: boolean
  onSwap: (round: number, court: number, slot: (typeof SLOTS)[number], playerId: string) => void
  onUnknown: (round: number, court: number, playerId: string, on: boolean) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const everyone = Object.values(session.players).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <h2 style={{ fontSize:15, margin:'0 0 4px' }}>Games</h2>
      <p style={{ color:T.muted, fontSize:12, margin:'0 0 10px' }}>
        If someone played under another person&apos;s name, fix it here so the result and rating go to the right person.
      </p>
      {[...session.rounds].reverse().map((r) => (
        <div key={r.index} style={{ marginBottom:10 }}>
          <div style={{ fontSize:12, fontWeight:800, color:T.muted, margin:'4px 0 6px' }}>ROUND {r.index}</div>
          <div style={{ display:'grid', gap:6 }}>
            {r.matches.map((m) => {
              const k = `${r.index}:${m.court}`
              const res = session.results.find((g) => g.round === r.index && g.court === m.court)
              const ids = [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b]
              const unrated = new Set(res?.unrated ?? [])
              return (
                <div key={k} style={{ background:T.card2, border:`1px solid ${T.border}`, borderRadius:8, padding:'9px 10px' }}>
                  <button onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}
                    style={{ all:'unset', cursor:'pointer', display:'block', width:'100%', fontSize:14, minHeight:32 }}>
                    <span style={{ color:T.muted }}>C{m.court} · </span>
                    {ids.slice(0, 2).map((id) => <span key={id} style={{ textDecoration: unrated.has(id) ? 'line-through' : 'none' }}>{nm(id)} </span>)}
                    <strong>{res ? `${res.scoreA}–${res.scoreB}` : 'v'}</strong>{' '}
                    {ids.slice(2).map((id) => <span key={id} style={{ textDecoration: unrated.has(id) ? 'line-through' : 'none' }}>{nm(id)} </span>)}
                    <span style={{ float:'right', color:T.muted }}>{open === k ? '▴' : 'Edit ▾'}</span>
                  </button>
                  {open === k && (
                    <div style={{ display:'grid', gap:8, marginTop:10 }}>
                      {SLOTS.map((slot, i) => (
                        <div key={slot} style={{ display:'grid', gap:5 }}>
                          <label style={{ fontSize:12, color:T.muted }}>
                            {nm(ids[i])} was really played by…
                            <select defaultValue="" disabled={busy} style={inp({ marginTop:4, fontSize:15, padding:'10px' })}
                              onChange={(e) => { const v = e.target.value; e.target.value = ''
                                if (v && confirm(`${session.players[v]?.name} played round ${r.index} court ${m.court} instead of ${session.players[ids[i]]?.name}? The result and rating change move to ${session.players[v]?.name}.`))
                                  onSwap(r.index, m.court, slot, v) }}>
                              <option value="">Choose who played</option>
                              {everyone.filter((p) => !ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </label>
                          {res && (
                            <button disabled={busy} style={{ ...btn(unrated.has(ids[i]) ? 'primary' : 'ghost'), minHeight:44, fontSize:13 }}
                              onClick={() => onUnknown(r.index, m.court, ids[i], !unrated.has(ids[i]))}>
                              {unrated.has(ids[i])
                                ? `Unknown substitute for ${nm(ids[i])} — tap to count the game for them again`
                                : `Unknown substitute played for ${nm(ids[i])}`}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {session.rounds.length === 0 && <p style={{ color:T.muted, fontSize:13, margin:0 }}>No games yet.</p>}
    </section>
  )
}
