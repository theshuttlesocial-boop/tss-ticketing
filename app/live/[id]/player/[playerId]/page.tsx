'use client'
import { use } from 'react'
import { useLiveSession } from '../../../_hooks/useLiveSession'
import { T } from '../../../_components/theme'
import { FormBadges, RatingTrend, LastDelta } from '../../../_components/Form'

export default function PlayerPage({ params }: { params: Promise<{ id: string; playerId: string }> }) {
  const { id, playerId } = use(params)
  const { session, error, loading } = useLiveSession(id)

  const shell = (msg: string) => (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.muted, display:'grid',
      placeItems:'center', padding:24, textAlign:'center',
      fontFamily:'DM Sans, system-ui, sans-serif' }}>{msg}</div>
  )
  if (loading) return shell('Loading…')
  if (error || !session) return shell(error ?? 'Session not found')

  const me = session.players[playerId]
  if (!me) return shell('Player not in this session')

  const round = session.rounds[session.rounds.length - 1]
  const match = round?.matches.find(m =>
    [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].includes(playerId))
  const sittingNow = round?.sitOuts.includes(playerId) ?? false

  const nm = (pid: string) => session.players[pid]?.name ?? '—'
  let partner: string | null = null
  let opponents: string[] = []
  if (match) {
    const onA = match.teamA.a === playerId || match.teamA.b === playerId
    const mine = onA ? match.teamA : match.teamB
    const theirs = onA ? match.teamB : match.teamA
    partner = nm(mine.a === playerId ? mine.b : mine.a)
    opponents = [nm(theirs.a), nm(theirs.b)]
  }

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:12, color:T.muted, textTransform:'uppercase',
        letterSpacing:'1px', fontWeight:600, marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700 }}>{children}</div>
    </div>
  )

  return (
    <div style={{
      minHeight:'100vh', background:T.bg, color:T.text, padding:'28px 20px',
      fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box',
      maxWidth:520, margin:'0 auto',
    }}>
      <div style={{ fontSize:13, color:T.muted, letterSpacing:'1px',
        textTransform:'uppercase', fontWeight:600 }}>
        {round ? `Round ${round.index}` : 'Not started'}
      </div>
      <h1 style={{ fontSize:34, fontWeight:900, margin:'4px 0 22px', letterSpacing:'-0.5px' }}>
        {me.name}
      </h1>

      <div style={{
        background: sittingNow ? T.infoDim : T.card,
        border:`1px solid ${sittingNow ? T.info : T.accentBorder}`,
        borderRadius:14, padding:'22px 20px', marginBottom:18,
      }}>
        {sittingNow ? (
          <>
            <div style={{ fontSize:28, fontWeight:900, color:T.info, marginBottom:6 }}>
              Sitting out
            </div>
            <div style={{ color:T.muted, fontSize:15 }}>
              You are back on next round. {round!.sitOuts.length - 1} others are resting too.
            </div>
          </>
        ) : match ? (
          <>
            <div style={{ fontSize:13, color:T.muted, textTransform:'uppercase',
              letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Your court</div>
            <div style={{ fontSize:52, fontWeight:900, color:T.accent, lineHeight:1, marginBottom:18 }}>
              {match.court}
            </div>
            <Row label="Partner">{partner}</Row>
            <Row label="Against">{opponents.join('  ·  ')}</Row>
          </>
        ) : (
          <div style={{ color:T.muted, fontSize:16 }}>Waiting for the next round to be drawn.</div>
        )}
      </div>

      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14,
        padding:'18px 18px 12px', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase',
              letterSpacing:'1px', fontWeight:600 }}>Rating</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:9 }}>
              <span style={{ fontSize:38, fontWeight:900, lineHeight:1.1 }}>{Math.round(me.rating)}</span>
              <LastDelta player={me} />
            </div>
          </div>
          <RatingTrend history={me.history} start={session.config.rating.start[me.level]} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
          <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase',
            letterSpacing:'1px', fontWeight:600 }}>Form</div>
          <FormBadges playerId={playerId} results={session.results} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        {[
          { label:'Games',   value: me.games },
          { label:'Sat out', value: me.sitOuts },
          { label:'Level',   value: me.level[0].toUpperCase() + me.level.slice(1) },
        ].map(s => (
          <div key={s.label} style={{
            background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 12px',
          }}>
            <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:800 }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
