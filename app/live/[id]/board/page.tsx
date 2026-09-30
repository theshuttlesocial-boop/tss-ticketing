'use client'
import { use } from 'react'
import { useLiveSession } from '../../_hooks/useLiveSession'
import { CourtCard } from '../../_components/CourtCard'
import { T } from '@/app/_design/theme'
import { displayNames } from '@/lib/live-session/displayNames'
import { RoundTimer } from '../../_components/RoundTimer'

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, error, loading, offset } = useLiveSession(id)

  const shell = (msg: string) => (
    <div className="is-dark" style={{ minHeight:'100vh', color:T.muted, display:'grid',
      placeItems:'center', fontFamily:'inherit', fontSize:24 }}>{msg}</div>
  )
  if (loading) return shell('Loading…')
  if (error || !session) return shell(error ?? 'Session not found')

  const round = session.rounds[session.rounds.length - 1]
  if (!round) return shell('Waiting for the first round…')

  const short = displayNames(Object.values(session.players).map((p: any) => ({ id: p.id, name: p.name })))
  const scoreOf = (court: number) =>
    session.results.find(r => r.round === round.index && r.court === court)

  return (
    // The TV board is always dark: best contrast on a big screen in a sports hall.
    <div className="is-dark" style={{
      minHeight:'100vh', color:T.text, padding:'28px 32px',
      fontFamily:'inherit', boxSizing:'border-box',
    }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:16, marginBottom:22 }}>
        <div style={{ fontSize:52, fontWeight:900, letterSpacing:'-0.03em' }}>Round <span style={{ color:T.accent, fontStyle:'italic' }}>{round.index}</span></div>
        <div style={{ fontSize:20, color:T.muted }}>
          {round.matches.length} courts
        </div>
        <div style={{ marginLeft:'auto' }}>
          <RoundTimer mode="board" timer={round.timer} round={round.index} offset={offset} />
        </div>
      </div>

      <div style={{
        display:'grid', gap:16,
        gridTemplateColumns:`repeat(${Math.min(round.matches.length, 2)}, 1fr)`,
      }}>
        {round.matches.map(m => {
          const s = scoreOf(m.court)
          return <CourtCard key={m.court} match={m} players={session.players} big
            scoreA={s?.scoreA ?? null} scoreB={s?.scoreB ?? null} />
        })}
      </div>

      {round.sitOuts.length > 0 && (
        <div style={{
          marginTop:22, background:T.card, border:`1px solid ${T.border}`,
          borderRadius:24, padding:'18px 22px',
        }}>
          <div style={{ fontSize:13, color:T.muted, textTransform:'uppercase',
            letterSpacing:'1px', fontWeight:600, marginBottom:10 }}>
            Sitting out this round
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'10px 18px' }}>
            {round.sitOuts.map(pid => (
              <span key={pid} style={{ fontSize:22, fontWeight:600 }}>
                {short[pid] ?? session.players[pid]?.name ?? '—'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
