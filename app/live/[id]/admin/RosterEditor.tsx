'use client'
import { useRef, useState, useEffect } from 'react'
import { T, inp, btn } from '../../_components/theme'
import { LEVEL_INFO, LEVELS } from '@/lib/live-session/levels'
import type { LevelChange } from '@/lib/live-session/engine'
import type { PreviousLevel } from '../../_hooks/useLiveSession'

type P = {
  id: string; name: string; level: string; rating: number
  startLevel?: string; registeredLevel?: string; levelChanges?: LevelChange[]; levelLocked?: boolean
  accountId?: string
}
const L = (l?: string) => (l ? l[0].toUpperCase() + l.slice(1) : '?')

/** Mid-session controls. Absent during registration, where edits are simple corrections. */
/** iOS/Android share sheet (WhatsApp, Messages…); copies the link where there isn't one. */
export async function sharePlayerLink(name: string, url: string) {
  const first = name.split(' ')[0]
  if (navigator.share) {
    try { await navigator.share({ title: 'Your TSS live page', text: `${first}, here's your page for tonight's session:`, url }); return }
    catch (e) { if ((e as Error).name === 'AbortError') return }
  }
  try { await navigator.clipboard.writeText(url); alert(`${first}'s link copied`) } catch { window.prompt('Copy this link', url) }
}

/** Per-player QR and PIN, available before and during the session. */
export type ShareControls = {
  onQr: (p: P) => void
  onNewPin: (p: P) => void
  /** Link a name-only entry to someone's TSS account (by their sign-in email). */
  onLink: (p: P) => void
}

export type LiveControls = {
  nextRound: number
  onLeave: (p: P) => void
  onLock: (id: string, locked: boolean) => void
  onStartLevel: (p: P) => void
}

/** "Last session (Session 89): moved Standard → Intermediate" — admin only. */
function previousLine(h?: PreviousLevel) {
  if (!h) return null
  const moved = h.moves.length ? `moved ${h.moves.map((m) => `${L(m.from)} → ${L(m.to)}`).join(', ')}` : `played as ${L(h.level)}`
  return `Last session (${h.session}): ${moved}`
}

/**
 * Roster list used both during registration and mid-session.
 *
 * `arrivalOrder`: during registration players are listed in the order they
 * appeared, newest at the bottom and briefly highlighted, so the organiser can
 * watch people register one by one. The server has no join timestamp, so the
 * order is tracked in the page: after a reload it starts alphabetical.
 */
export function RosterEditor({ players, onCourtIds, busy, arrivalOrder, onAdd, onRename, onLevel, onRemove, playerLink, history = {}, live, share }: {
  share?: ShareControls
  players: P[]
  history?: Record<string, PreviousLevel>
  live?: LiveControls
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
            onRename={onRename} onLevel={onLevel} onRemove={onRemove} link={playerLink?.(p.id)}
            prev={previousLine(history[p.id])} live={live} share={share} />
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

function Row({ p, busy, onCourt, fresh, onRename, onLevel, onRemove, link, prev, live, share }: {
  p: P; busy: boolean; onCourt: boolean; fresh: boolean; link?: string
  prev: string | null; live?: LiveControls; share?: ShareControls
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
              <button aria-label={`Share ${p.name}'s page`} title="Send this player their page"
                style={{ ...btn(), padding:'8px 12px', fontSize:13, minHeight:40 }}
                onClick={() => sharePlayerLink(p.name, link)}>Share</button>
            )}
          </>
        )}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
        <select aria-label={`Level for ${p.name}`} style={inp({ padding:'10px 9px', fontSize:15 })} value={p.level} disabled={busy}
          onChange={(e) => {
            const to = e.target.value
            if (live && !confirm(`Move ${p.name} to ${L(to)} from round ${live.nextRound}?\n\nGames already played stay as they were. Their rating is moved to at least/at most ${L(to)}'s starting number.`)) {
              e.target.value = p.level; return
            }
            onLevel(p.id, to)
          }}>
          {LEVELS.map((l) => <option key={l} value={l}>{L(l)}</option>)}
        </select>
        {live ? (
          <button style={{ ...btn('danger'), padding:'10px 12px', fontSize:14, minHeight:44 }} disabled={busy}
            aria-label={`${p.name} is leaving`} onClick={() => live.onLeave(p)}>Left</button>
        ) : (
          <button style={{ ...btn('danger'), padding:'7px 12px', fontSize:13 }}
            disabled={busy || onCourt}
            title={onCourt ? 'On court — swap them out or undo the round first' : 'Remove'}
            aria-label={`Remove ${p.name}`}
            onClick={() => { if (confirm(`Remove ${p.name}? If they have already played, they are marked as left: their games still count and they are not drawn again.`)) onRemove(p.id) }}>Remove</button>
        )}
      </div>
      {share && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:8 }}>
          <button style={{ ...btn(), fontSize:13, minHeight:44 }} onClick={() => share.onQr(p)}>QR code</button>
          <button style={{ ...btn(), fontSize:13, minHeight:44 }} disabled={busy}
            onClick={() => { if (confirm(`Give ${p.name} a new PIN? Their old PIN stops working.`)) share.onNewPin(p) }}>New PIN</button>
          <button style={{ ...btn(p.accountId ? 'primary' : 'ghost'), fontSize:13, minHeight:44 }} disabled={busy}
            aria-label={p.accountId ? `${p.name} is linked to an account` : `Link ${p.name} to an account`}
            onClick={() => share.onLink(p)}>{p.accountId ? '✓ Account' : 'Link account'}</button>
        </div>
      )}
      {live && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
          <button style={{ ...btn(p.levelLocked ? 'primary' : 'ghost'), fontSize:13, minHeight:44 }} disabled={busy}
            aria-pressed={!!p.levelLocked}
            onClick={() => live.onLock(p.id, !p.levelLocked)}>{p.levelLocked ? '🔒 Level locked' : 'Lock level'}</button>
          <button style={{ ...btn(), fontSize:13, minHeight:44 }} disabled={busy}
            onClick={() => live.onStartLevel(p)}>Starting level…</button>
        </div>
      )}
      {(p.registeredLevel && p.registeredLevel !== p.level) || (p.levelChanges ?? []).length || prev ? (
        <div style={{ fontSize:12, color:T.muted, marginTop:7, lineHeight:1.5 }}>
          {p.registeredLevel && p.registeredLevel !== p.level && <div>Picked {L(p.registeredLevel)}{p.startLevel && p.startLevel !== p.registeredLevel ? ` · starting level ${L(p.startLevel)}` : ''}</div>}
          {(p.levelChanges ?? []).map((c, i) => (
            <div key={i}>{L(c.from)} → {L(c.to)} from R{c.beforeRound} · {c.by === 'system' ? 'automatic' : 'admin'}</div>
          ))}
          {prev && <div>{prev}</div>}
        </div>
      ) : null}
    </div>
  )
}
