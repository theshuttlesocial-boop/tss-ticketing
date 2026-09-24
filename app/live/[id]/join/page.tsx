'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiveSession } from '../../_hooks/useLiveSession'
import { T, inp } from '../../_components/theme'

/**
 * One QR for the whole session lands here. The player taps their name once;
 * it is remembered per session, so a re-scan goes straight to their page.
 *
 * Replaces the previous design of one QR per player, which needed the admin to
 * show 28 people 28 different codes.
 */
export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, error, loading } = useLiveSession(id)
  const router = useRouter()
  const [filter, setFilter] = useState('')

  // Already chosen on this phone? Go straight through.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`tss-live-player:${id}`)
      if (saved) router.replace(`/live/${id}/player/${saved}`)
    } catch { /* private mode: just show the picker */ }
  }, [id, router])

  const shell = (m: string) => (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.muted, display:'grid',
      placeItems:'center', padding:24, textAlign:'center',
      fontFamily:'DM Sans, system-ui, sans-serif' }}>{m}</div>
  )
  if (loading) return shell('Loading…')
  if (error || !session) return shell(error ?? 'Session not found')

  const players = Object.values(session.players)
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(p => p.name.toLowerCase().includes(filter.trim().toLowerCase()))

  const choose = (pid: string) => {
    try { localStorage.setItem(`tss-live-player:${id}`, pid) } catch { /* ignore */ }
    router.push(`/live/${id}/player/${pid}`)
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, padding:'26px 18px',
      fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box',
      maxWidth:560, margin:'0 auto' }}>
      <div style={{ fontSize:12, color:T.muted, textTransform:'uppercase',
        letterSpacing:'1px', fontWeight:600 }}>Live session</div>
      <h1 style={{ fontSize:30, fontWeight:900, margin:'4px 0 6px' }}>Who are you?</h1>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 16px' }}>
        Tap your name once. This phone will remember you for the rest of the night.
      </p>

      {Object.keys(session.players).length > 12 && (
        <input autoFocus={false} placeholder="Search your name" style={{ ...inp(), marginBottom:14 }}
          value={filter} onChange={e => setFilter(e.target.value)} />
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
        {players.map(p => (
          <button key={p.id} onClick={() => choose(p.id)} style={{
            background:T.card, border:`1px solid ${T.border}`, borderRadius:12,
            padding:'16px 12px', color:T.text, fontSize:17, fontWeight:700,
            cursor:'pointer', fontFamily:'inherit', textAlign:'center',
          }}>{p.name}</button>
        ))}
      </div>

      {players.length === 0 && (
        <p style={{ color:T.muted, fontSize:14, marginTop:16 }}>
          No one matches “{filter}”. Ask the organiser to add you.
        </p>
      )}
    </div>
  )
}
