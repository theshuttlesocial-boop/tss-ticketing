'use client'
import { useRef, useState, useEffect } from 'react'
import { T, inp, btn } from '../../_components/theme'
import { LEVEL_INFO, LEVELS } from '@/lib/live-session/levels'

type P = { id: string; name: string; level: string; rating: number }

/**
 * Roster list used both during registration and mid-session.
 *
 * `arrivalOrder`: during registration players are listed in the order they
 * appeared, newest at the bottom and briefly highlighted, so the organiser can
 * watch people register one by one. The server has no join timestamp, so the
 * order is tracked in the page: after a reload it starts alphabetical.
 */
export function RosterEditor({ players, onCourtIds, busy, arrivalOrder, onAdd, onRename, onLevel, onRemove, playerLink }: {
  players: P[]
  onCourtIds: Set<string>
  busy: boolean
  arrivalOrder?: boolean
  onAdd: (name: string, level: string) => void
  onRename: (id: string, name: string) => void
  onLevel: (id: string, level: string) => void
  onRemove: (id: string) => void
  /** URL of a player's own page, for handing to someone on a new phone. */
  playerLink?: (id: string) => string
}) {
  const order = useRef<string[]>([])
  const seenAt = useRef<Record<string, number>>({})
  const [, tick] = useState(0)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [lvl, setLvl] = useState('standard')

  const ids = new Set(players.map((p) => p.id))
  if (order.current.length === 0) {
    order.current = [...players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => p.id)
  } else {
    order.current = order.current.filter((id) => ids.has(id))
    for (const p of players) {
      if (!order.current.includes(p.id)) { order.current.push(p.id); seenAt.current[p.id] = Date.now() }
    }
  }
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 4000); return () => clearInterval(t) }, [])

  const byId = new Map(players.map((p) => [p.id, p]))
  const list = arrivalOrder
    ? order.current.map((id) => byId.get(id)!).filter(Boolean)
    : [...players].sort((a, b) => a.name.localeCompare(b.name))

  const counts = LEVEL_INFO.map((l) => ({ ...l, n: players.filter((p) => p.level === l.level).length }))
  const add = () => {
    const name = `${first.trim()} ${last.trim()}`.trim()
    if (!name) return
    onAdd(name, lvl); setFirst(''); setLast('')
  }

  return (
    <div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 12px', marginBottom:12, fontSize:13 }}>
        <strong style={{ fontSize:15 }}>{players.length} registered</strong>
        {counts.map((c) => (
          <span key={c.level} style={{ display:'inline-flex', alignItems:'center', gap:5, color:T.muted }}>
            <span style={{ width:9, height:9, borderRadius:'50%', background:c.dot }} />{c.label} {c.n}
          </span>
        ))}
      </div>

      <div style={{ display:'grid', gap:6, marginBottom:14 }}>
        {list.map((p) => (
          <Row key={p.id} p={p} busy={busy} onCourt={onCourtIds.has(p.id)}
            fresh={!!seenAt.current[p.id] && Date.now() - seenAt.current[p.id] < 8000}
            onRename={onRename} onLevel={onLevel} onRemove={onRemove} link={playerLink?.(p.id)} />
        ))}
        {list.length === 0 && (
          <div style={{ color:T.muted, fontSize:14, padding:'14px 0' }}>
            Nobody yet. Players appear here as they register via the QR code.
          </div>
        )}
      </div>

      <div style={{ background:T.card2, border:`1px solid ${T.border}`, borderRadius:10, padding:10 }}>
        <div style={{ fontSize:12, color:T.muted, marginBottom:7 }}>Add someone who can&apos;t register themselves</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:7 }}>
          <input style={inp()} placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
          <input style={inp()} placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:7 }}>
          <select style={inp()} value={lvl} onChange={(e) => setLvl(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
          </select>
          <button style={btn('primary')} disabled={busy || !first.trim()} onClick={add}>Add</button>
        </div>
      </div>
    </div>
  )
}

function Row({ p, busy, onCourt, fresh, onRename, onLevel, onRemove, link }: {
  p: P; busy: boolean; onCourt: boolean; fresh: boolean; link?: string
  onRename: (id: string, name: string) => void
  onLevel: (id: string, level: string) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(p.name)
  useEffect(() => { if (!editing) setVal(p.name) }, [p.name, editing])
  const dot = LEVEL_INFO.find((l) => l.level === p.level)?.dot ?? T.muted

  return (
    <div style={{
      background: fresh ? T.accentDim : T.card2,
      border:`1px solid ${fresh ? T.accentBorder : T.border}`, borderRadius:10, padding:'9px 10px',
      transition:'background 1s',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:dot, flexShrink:0 }} />
        {editing ? (
          <>
            <input autoFocus style={inp({ padding:'6px 8px', fontSize:15 })} value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) { onRename(p.id, val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }} />
            <button style={{ ...btn('primary'), padding:'6px 10px' }} disabled={busy || !val.trim()}
              onClick={() => { onRename(p.id, val); setEditing(false) }}>Save</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} title="Edit name" aria-label={`Edit name: ${p.name}`} style={{
              flex:1, textAlign:'left', background:'none', border:'none', color:T.text,
              fontSize:15, fontWeight:700, cursor:'pointer', padding:0, fontFamily:'inherit' }}>
              {p.name} <span style={{ color:T.muted, fontSize:12, fontWeight:400 }}>✎</span>
            </button>
            {onCourt && <span style={{ color:T.accent, fontSize:11 }}>on court</span>}
            {link && (
              <button aria-label={`Copy ${p.name}'s player link`} title="Copy this player's page link"
                style={{ ...btn(), padding:'4px 9px', fontSize:12 }}
                onClick={() => { navigator.clipboard?.writeText(link); }}>Link</button>
            )}
          </>
        )}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
        <select aria-label={`Level for ${p.name}`} style={inp({ padding:'7px 9px', fontSize:13 })} value={p.level} disabled={busy}
          onChange={(e) => onLevel(p.id, e.target.value)}>
          {LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
        </select>
        <button style={{ ...btn('danger'), padding:'7px 12px', fontSize:13 }}
          disabled={busy || onCourt}
          title={onCourt ? 'On court — swap them out or undo the round first' : 'Remove'}
          aria-label={`Remove ${p.name}`}
          onClick={() => { if (confirm(`Remove ${p.name}? If they have already played, they are marked as left: their games still count and they are not drawn again.`)) onRemove(p.id) }}>Remove</button>
      </div>
    </div>
  )
}
