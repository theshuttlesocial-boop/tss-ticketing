'use client'
import { use, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'
import { T } from '../../../_components/theme'
import { FormBadges, RatingTrend, LastDelta } from '../../../_components/Form'
import { displayNames } from '@/lib/live-session/displayNames'

/**
 * A player's own view. Reads /api/live/[id]/player/[playerId], which returns
 * this player's rating and form plus the redacted session — no other player's
 * numbers, no roster size, no game counts.
 */
export default function PlayerPage({ params }: { params: Promise<{ id: string; playerId: string }> }) {
  const { id, playerId } = use(params)
  const [view, setView] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/${id}/player/${playerId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not load'); return }
      setView(json.player); setError(null)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [id, playerId])

  useEffect(() => { refetch() }, [refetch])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const nudge = () => { if (t) clearTimeout(t); t = setTimeout(refetch, 150) }
    const ch = supabase.channel(`live-player:${playerId}`)
    for (const table of ['live_games', 'live_rounds']) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `session_id=eq.${id}` }, nudge)
    }
    ch.subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [id, playerId, refetch])

  const shell = (m: string) => (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.muted, display:'grid',
      placeItems:'center', padding:24, textAlign:'center',
      fontFamily:'DM Sans, system-ui, sans-serif' }}>{m}</div>
  )
  if (loading) return shell('Loading…')
  if (error || !view) return shell(error ?? 'Not found')

  const round = view.rounds[view.rounds.length - 1]
  const match = round?.matches.find((m: any) =>
    [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].includes(playerId))
  const sittingNow = round?.sitOuts.includes(playerId) ?? false
  const short = displayNames(Object.values(view.players as Record<string, any>).map((p: any) => ({ id: p.id, name: p.name })))
  const nm = (pid: string) => short[pid] ?? view.players[pid]?.name ?? '—'

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
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, padding:'28px 20px',
      fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box',
      maxWidth:520, margin:'0 auto' }}>
      <div style={{ fontSize:13, color:T.muted, letterSpacing:'1px',
        textTransform:'uppercase', fontWeight:600 }}>
        {round ? `Round ${round.index}` : 'Not started'}
      </div>
      <h1 style={{ fontSize:34, fontWeight:900, margin:'4px 0 22px', letterSpacing:'-0.5px' }}>
        {view.name}
      </h1>

      <div style={{
        background: sittingNow ? T.infoDim : T.card,
        border:`1px solid ${sittingNow ? T.info : T.accentBorder}`,
        borderRadius:14, padding:'22px 20px', marginBottom:14,
      }}>
        {sittingNow ? (
          <>
            <div style={{ fontSize:28, fontWeight:900, color:T.info, marginBottom:6 }}>
              Sitting out
            </div>
            <div style={{ color:T.muted, fontSize:15 }}>
              You are back on next round.
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
        padding:'18px 18px 12px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase',
              letterSpacing:'1px', fontWeight:600 }}>Your rating</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:9 }}>
              <span style={{ fontSize:38, fontWeight:900, lineHeight:1.1 }}>
                {Math.round(view.rating)}
              </span>
              <LastDelta player={{ history: view.history } as any} />
            </div>
          </div>
          <RatingTrend history={view.history} start={view.startRating} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
          <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase',
            letterSpacing:'1px', fontWeight:600 }}>Your results</div>
          <FormBadges playerId={playerId} results={view.results} />
        </div>
      </div>
    </div>
  )
}
