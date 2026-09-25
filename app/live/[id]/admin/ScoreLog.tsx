'use client'
import { T, cardStyle } from '../../_components/theme'

export type LogRow = {
  id: string; round: number; court: number; event: 'score' | 'undo' | 'override'
  old_a: number | null; old_b: number | null; new_a: number | null; new_b: number | null
  detail: any; created_at: string
}

const fmt = (a: number | null, b: number | null) => (a == null || b == null ? '—' : `${a}–${b}`)
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

/** Every score entry, correction, undo and override, newest first. */
export function ScoreLog({ log, unavailable }: { log: LogRow[]; unavailable: string | null }) {
  return (
    <section style={{ ...cardStyle, padding:14 }}>
      <h2 style={{ fontSize:15, margin:'0 0 4px' }}>Score history</h2>
      <p style={{ color:T.muted, fontSize:12, margin:'0 0 10px' }}>
        Every score entered or changed, undone rounds and player swaps — so a disputed result can be traced.
      </p>
      {unavailable ? (
        <p style={{ color:T.warning, fontSize:13, margin:0 }}>
          Not recording yet — migration 008 needs running in Supabase. Scores still save normally.
        </p>
      ) : log.length === 0 ? (
        <p style={{ color:T.muted, fontSize:13, margin:0 }}>No scores yet.</p>
      ) : (
        <div style={{ display:'grid', gap:5 }}>
          {log.map((r) => {
            const teams = r.detail?.teamA && r.detail?.teamB
              ? `${r.detail.teamA.join(' & ')} v ${r.detail.teamB.join(' & ')}` : ''
            const what =
              r.event === 'undo' ? <>round undone — {fmt(r.old_a, r.old_b)} discarded</>
              : r.event === 'override' ? <>swap {r.detail?.slot}: {r.detail?.from ?? '?'} → {r.detail?.to ?? '?'}</>
              : r.old_a == null ? <>entered <strong>{fmt(r.new_a, r.new_b)}</strong></>
              : <>changed {fmt(r.old_a, r.old_b)} → <strong style={{ color:T.warning }}>{fmt(r.new_a, r.new_b)}</strong></>
            return (
              <div key={r.id} style={{ background:T.card2, border:`1px solid ${r.old_a != null && r.event === 'score' ? T.warning : T.border}`,
                borderRadius:8, padding:'7px 10px', fontSize:13 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                  <span>R{r.round} · C{r.court} · {what}</span>
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
