'use client'
import { use } from 'react'
import { useLiveSession } from '../../_hooks/useLiveSession'
import { CourtCard } from '../../_components/CourtCard'
import { T } from '../../_components/theme'

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, error, loading } = useLiveSession(id)

  const shell = (msg: string) => (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.muted, display:'grid',
      placeItems:'center', fontFamily:'DM Sans, system-ui, sans-serif', fontSize:24 }}>{msg}</div>
  )
  if (loading) return shell('Loading…')
  if (error || !session) return shell(error ?? 'Session not found')

  const round = session.rounds[session.rounds.length - 1]
  if (!round) return shell('Waiting for the first round…')

  const scoreOf = (court: number) =>
    session.results.find(r => r.round === round.index && r.court === court)

  return (
    <div style={{
      minHeight:'100vh', background:T.bg, color:T.text, padding:'28px 32px',
      fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box',
    }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:16, marginBottom:22 }}>
        <div style={{ fontSize:44, fontWeight:900, letterSpacing:'-1px' }}>Round {round.index}</div>
        <div style={{ fontSize:20, color:T.muted }}>
          {round.matches.length} courts
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
          borderRadius:12, padding:'16px 20px',
        }}>
          <div style={{ fontSize:13, color:T.muted, textTransform:'uppercase',
            letterSpacing:'1px', fontWeight:600, marginBottom:10 }}>
            Sitting out this round
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'10px 18px' }}>
            {round.sitOuts.map(pid => (
              <span key={pid} style={{ fontSize:22, fontWeight:600 }}>
                {session.players[pid]?.name ?? '—'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
