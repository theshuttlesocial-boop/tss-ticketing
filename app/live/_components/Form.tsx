'use client'
import { T } from './theme'
import type { GameResult, Player } from '@/lib/live-session/engine'

/** Recent results as W/L chips, most recent last. */
export function FormBadges({ playerId, results, max = 5 }: {
  playerId: string; results: GameResult[]; max?: number
}) {
  const form = results
    .filter(g => [g.teamA.a, g.teamA.b, g.teamB.a, g.teamB.b].includes(playerId))
    .sort((a, b) => a.round - b.round || a.court - b.court)
    .slice(-max)
    .map(g => {
      const onA = g.teamA.a === playerId || g.teamA.b === playerId
      return (onA ? g.scoreA > g.scoreB : g.scoreB > g.scoreA) ? 'W' : 'L'
    })

  if (form.length === 0) return <span style={{ color:T.muted, fontSize:12 }}>—</span>

  return (
    <span style={{ display:'inline-flex', gap:4 }}>
      {form.map((r, i) => (
        <span key={i} style={{
          width:20, height:20, borderRadius:5, display:'grid', placeItems:'center',
          fontSize:11, fontWeight:800,
          background: r === 'W' ? T.accentDim : 'rgba(255,255,255,0.05)',
          color: r === 'W' ? T.accent : T.muted,
          border: `1px solid ${r === 'W' ? T.accentBorder : T.border}`,
        }}>{r}</span>
      ))}
    </span>
  )
}

/** Rating trajectory as a sparkline. */
export function RatingTrend({ history, start, width = 160, height = 44 }: {
  history: number[]; start: number; width?: number; height?: number
}) {
  const pts = [start, ...history]
  if (pts.length < 2) return null
  const min = Math.min(...pts), max = Math.max(...pts)
  const span = max - min || 1
  const x = (i: number) => (i / (pts.length - 1)) * width
  const y = (v: number) => height - ((v - min) / span) * (height - 6) - 3
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  const up = pts[pts.length - 1] >= pts[0]
  const colour = up ? T.accent : T.warning

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id="tssTrend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#tssTrend)" />
      <path d={line} fill="none" stroke={colour} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="3" fill={colour} />
    </svg>
  )
}

/** Signed points change from the most recent rated game. */
export function LastDelta({ player }: { player: Player }) {
  const h = player.history
  if (h.length < 1) return null
  const prev = h.length >= 2 ? h[h.length - 2] : null
  if (prev === null) return null
  const d = Math.round(h[h.length - 1] - prev)
  if (d === 0) return null
  return (
    <span style={{ fontSize:13, fontWeight:700, color: d > 0 ? T.accent : T.warning }}>
      {d > 0 ? '▲' : '▼'} {d > 0 ? '+' : ''}{d}
    </span>
  )
}
