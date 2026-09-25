'use client'
import { useState, useEffect } from 'react'
import { T, inp, btn } from '../../_components/theme'
import { displayNames } from '@/lib/live-session/displayNames'
import type { Match, Player, GameResult } from '@/lib/live-session/engine'

/**
 * One court's score entry, built for a phone held upright.
 *
 * The score box sits on the same row as the pair it belongs to, so there is no
 * "which one is A?" step. That ambiguity is what produced a reversed score
 * last session.
 */
export function ScoreCard({ match, players, existing, busy, onSave }: {
  match: Match
  players: Record<string, Player>
  existing?: GameResult
  busy: boolean
  onSave: (a: number, b: number) => void
}) {
  const [a, setA] = useState(existing ? String(existing.scoreA) : '')
  const [b, setB] = useState(existing ? String(existing.scoreB) : '')
  useEffect(() => {
    setA(existing ? String(existing.scoreA) : '')
    setB(existing ? String(existing.scoreB) : '')
  }, [existing?.scoreA, existing?.scoreB])

  const short = displayNames(Object.values(players).map(p => ({ id: p.id, name: p.name })))
  const nm = (id: string) => short[id] ?? players[id]?.name ?? '—'
  const saved = !!existing
  const dirty = saved ? (a !== String(existing!.scoreA) || b !== String(existing!.scoreB)) : (a !== '' && b !== '')
  const aWon = saved && existing!.scoreA > existing!.scoreB

  const row = (pair: { a: string; b: string }, val: string, set: (v: string) => void, won: boolean) => (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'10px 12px', borderRadius:10,
      background: saved && won ? T.accentDim : T.card2,
      border:`1px solid ${saved && won ? T.accentBorder : T.border}`,
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:16, fontWeight:700, lineHeight:1.3 }}>{nm(pair.a)}</div>
        <div style={{ fontSize:16, fontWeight:700, lineHeight:1.3 }}>{nm(pair.b)}</div>
      </div>
      <input
        inputMode="numeric" pattern="[0-9]*" placeholder="–"
        aria-label={`Score for ${nm(pair.a)} and ${nm(pair.b)}`}
        value={val} onChange={e => set(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        style={inp({
          width:68, flexShrink:0, textAlign:'center', fontSize:26, fontWeight:800,
          padding:'8px 4px', background:T.bg,
        })}
      />
    </div>
  )

  return (
    <div style={{
      background:T.card, border:`1px solid ${saved ? T.border : T.borderHover}`,
      borderRadius:14, padding:12,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:9 }}>
        <span style={{ fontSize:12, color:T.muted, textTransform:'uppercase',
          letterSpacing:'1px', fontWeight:700 }}>Court {match.court}</span>
        {saved && !dirty && <span style={{ fontSize:12, color:T.accent, fontWeight:600 }}>✓ saved</span>}
      </div>

      <div style={{ display:'grid', gap:7 }}>
        {row(match.teamA, a, setA, aWon)}
        {row(match.teamB, b, setB, saved && !aWon)}
      </div>

      {dirty && (
        <button
          style={{ ...btn('primary'), width:'100%', marginTop:9, padding:'12px' }}
          disabled={busy || a === '' || b === '' || a === b}
          onClick={() => onSave(Number(a), Number(b))}>
          {a === b && a !== '' ? 'Scores cannot be equal' : saved ? 'Update score' : 'Save score'}
        </button>
      )}
    </div>
  )
}
