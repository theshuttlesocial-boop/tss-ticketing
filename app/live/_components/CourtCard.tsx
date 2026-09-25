'use client'
import { T } from './theme'
import { displayNames } from '@/lib/live-session/displayNames'
import type { Match, Player } from '@/lib/live-session/engine'

export function CourtCard({ match, players, big = false, scoreA, scoreB, children }: {
  match: Match
  players: Record<string, Player>
  big?: boolean
  scoreA?: number | null
  scoreB?: number | null
  children?: React.ReactNode
}) {
  const short = displayNames(Object.values(players).map(p => ({ id: p.id, name: p.name })))
  const nm = (id: string) => short[id] ?? players[id]?.name ?? '—'
  const played = scoreA != null && scoreB != null
  const aWon = played && (scoreA as number) > (scoreB as number)

  const side = (pair: { a: string; b: string }, won: boolean, score?: number | null) => (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
      padding: big ? '10px 14px' : '7px 10px', borderRadius:8,
      background: played && won ? T.accentDim : 'transparent',
      border: `1px solid ${played && won ? T.accentBorder : 'transparent'}`,
    }}>
      <div style={{ fontSize: big ? 26 : 14, fontWeight: big ? 700 : 500, lineHeight:1.35 }}>
        {nm(pair.a)}<span style={{ color:T.muted, margin:'0 6px' }}>+</span>{nm(pair.b)}
      </div>
      {played && <div style={{ fontSize: big ? 30 : 16, fontWeight:800, color: won ? T.accent : T.muted }}>{score}</div>}
    </div>
  )

  return (
    <div style={{
      background:T.card, border:`1px solid ${T.border}`, borderRadius:12,
      padding: big ? 18 : 12,
    }}>
      <div style={{
        fontSize: big ? 13 : 11, color:T.muted, textTransform:'uppercase',
        letterSpacing:'1px', marginBottom: big ? 12 : 8, fontWeight:600,
      }}>
        Court {match.court}
      </div>
      {side(match.teamA, aWon, scoreA)}
      <div style={{ textAlign:'center', color:T.muted, fontSize: big ? 12 : 10, margin:'3px 0' }}>v</div>
      {side(match.teamB, played && !aWon, scoreB)}
      {children}
    </div>
  )
}
