'use client'
import { useEffect, useState } from 'react'
import { T, btn, inp } from '@/app/_design/theme'
import { LEVELS } from '@/lib/live-session/levels'
import type { Level } from '@/lib/live-session/engine'

const L = (l: string) => l[0].toUpperCase() + l.slice(1)

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position:'fixed', inset:0, background:'var(--overlay)', zIndex:60, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background:T.card, borderTop:`1px solid ${T.border}`,
        borderRadius:'16px 16px 0 0', padding:'18px 16px calc(18px + env(safe-area-inset-bottom))', width:'100%', maxWidth:560,
        maxHeight:'88vh', overflowY:'auto', fontFamily:'inherit', color:T.text }}>
        <h2 style={{ fontSize:19, fontWeight:900, margin:'0 0 12px' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

type P = { id: string; name: string }

/**
 * "X is leaving — is someone playing in their place?"
 * No one / someone already here / a new guest. A substitute takes over the
 * leaver's place in the rotation, and their slot on court if they're playing now.
 */
export function LeaveSheet({ leaver, onCourt, candidates, busy, onClose, onConfirm }: {
  leaver: P
  onCourt: boolean
  candidates: P[]
  busy: boolean
  onClose: () => void
  onConfirm: (substitute: { player_id: string } | { name: string; level: Level } | null) => void
}) {
  const [mode, setMode] = useState<'none' | 'here' | 'guest'>(onCourt ? 'here' : 'none')
  const [who, setWho] = useState('')
  const [first, setFirst] = useState(''), [last, setLast] = useState('')
  const [level, setLevel] = useState<Level>('standard')
  const ready = mode === 'none' ? !onCourt : mode === 'here' ? !!who : !!first.trim()
  const Opt = ({ id, label, sub }: { id: typeof mode; label: string; sub: string }) => (
    <label style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'12px', minHeight:44, cursor:'pointer',
      background: mode === id ? T.accentDim : T.card2, border:`1px solid ${mode === id ? T.accentBorder : T.border}`, borderRadius:10 }}>
      <input type="radio" name="sub" checked={mode === id} onChange={() => setMode(id)} style={{ marginTop:3, width:18, height:18 }} />
      <span><strong style={{ fontSize:15 }}>{label}</strong><span style={{ display:'block', fontSize:12, color:T.muted, marginTop:2 }}>{sub}</span></span>
    </label>
  )
  return (
    <Sheet title={`${leaver.name} is leaving`} onClose={onClose}>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 12px' }}>
        Their games so far still count. Is someone playing in their place?
        {onCourt && <strong style={{ color:T.warning, display:'block', marginTop:6 }}>They&apos;re on court now, so someone has to take their slot.</strong>}
      </p>
      <div style={{ display:'grid', gap:8, marginBottom:14 }}>
        {!onCourt && <Opt id="none" label="No one" sub="They just won't be drawn again." />}
        <Opt id="here" label="Someone who's here" sub="Takes their slot now if they're on court." />
        {mode === 'here' && (
          <select aria-label="Who is playing instead" value={who} onChange={(e) => setWho(e.target.value)} style={inp({ fontSize:16, padding:'12px' })}>
            <option value="">Choose a player</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <Opt id="guest" label="A new guest" sub="Added now, and takes over their place in the rotation." />
        {mode === 'guest' && (
          <div style={{ display:'grid', gap:7 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
              <input style={inp({ fontSize:16 })} placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
              <input style={inp({ fontSize:16 })} placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <select aria-label="Guest level" value={level} onChange={(e) => setLevel(e.target.value as Level)} style={inp({ fontSize:16 })}>
              {LEVELS.map((l) => <option key={l} value={l}>{L(l)}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display:'grid', gap:8 }}>
        <button style={{ ...btn('danger'), padding:14, fontSize:15 }} disabled={busy || !ready}
          onClick={() => onConfirm(mode === 'none' ? null : mode === 'here' ? { player_id: who } : { name: `${first.trim()} ${last.trim()}`.trim(), level })}>
          Confirm {leaver.name} has left
        </button>
        <button style={{ ...btn(), padding:12 }} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

/**
 * "Correct starting level" — for a level picked wrongly at sign-up. Unlike a
 * normal level change this recalculates from game 1, so it shows whose ratings
 * move before anything is saved.
 */
export function StartLevelSheet({ player, busy, onClose, preview, apply }: {
  player: { id: string; name: string; startLevel?: Level; level: Level }
  busy: boolean
  onClose: () => void
  preview: (level: Level) => Promise<{ impact: { name: string; before: number; after: number; delta: number }[] } | null>
  apply: (level: Level) => void
}) {
  const from = player.startLevel ?? player.level
  const [level, setLevel] = useState<Level>(from)
  const [impact, setImpact] = useState<{ name: string; before: number; after: number; delta: number }[] | null>(null)
  useEffect(() => {
    let off = false
    setImpact(null)
    if (level !== from) preview(level).then((r) => { if (!off) setImpact(r?.impact ?? []) })
    return () => { off = true }
  }, [level]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={`Correct ${player.name}'s starting level`} onClose={onClose}>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 12px' }}>
        Use this only if they picked the wrong level when they signed up. It recalculates every game from the first,
        so other players&apos; ratings change too. To move them for the rest of tonight only, change their level in the roster instead.
      </p>
      <select aria-label="Starting level" value={level} onChange={(e) => setLevel(e.target.value as Level)} style={inp({ fontSize:16, padding:'12px', marginBottom:12 })}>
        {LEVELS.map((l) => <option key={l} value={l}>{L(l)}{l === from ? ' (current)' : ''}</option>)}
      </select>
      {level !== from && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:800, color:T.muted, marginBottom:6 }}>RATINGS THAT WILL CHANGE</div>
          {!impact ? <div style={{ color:T.muted, fontSize:13 }}>Working it out…</div>
            : impact.length === 0 ? <div style={{ color:T.muted, fontSize:13 }}>Nobody&apos;s rating changes.</div>
            : <div style={{ display:'grid', gap:3 }}>
                {impact.map((x) => (
                  <div key={x.name} style={{ display:'flex', justifyContent:'space-between', fontSize:14 }}>
                    <span>{x.name}</span>
                    <span style={{ fontVariantNumeric:'tabular-nums' }}>{Math.round(x.before)} → {Math.round(x.after)}{' '}
                      <strong style={{ color: x.delta > 0 ? T.accent : T.danger }}>{x.delta > 0 ? '+' : ''}{x.delta}</strong></span>
                  </div>
                ))}
              </div>}
        </div>
      )}
      <div style={{ display:'grid', gap:8 }}>
        <button style={{ ...btn('primary'), padding:14, fontSize:15 }} disabled={busy || level === from || !impact}
          onClick={() => apply(level)}>Recalculate from game 1</button>
        <button style={{ ...btn(), padding:12 }} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

/**
 * A player's own page as a big QR, for someone whose phone never registered
 * (added by the organiser) or who lost their page: they scan it off your screen.
 * Optionally shows a PIN just issued, which exists only until this closes.
 */
export function PlayerAccessSheet({ name, url, pin, onClose, onShare }: {
  name: string; url: string; pin?: string | null; onClose: () => void; onShare: () => void
}) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let off = false
    import('qrcode').then(async (QR) => {
      const out = await QR.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 320 })
      if (!off) setSvg(out)
    })
    return () => { off = true }
  }, [url])
  return (
    <Sheet title={pin ? `New PIN for ${name}` : `${name}'s page`} onClose={onClose}>
      {pin && (
        <div style={{ textAlign:'center', marginBottom:14 }}>
          <div style={{ fontSize:52, fontWeight:900, letterSpacing:'12px', color:T.accent, fontVariantNumeric:'tabular-nums' }}>{pin}</div>
          <p style={{ color:T.muted, fontSize:13, margin:'4px 0 0' }}>
            Tell them now — it isn&apos;t stored and won&apos;t be shown again. Their old PIN no longer works.
          </p>
        </div>
      )}
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 10px' }}>Ask {name.split(' ')[0]} to scan this with their phone camera.</p>
      <div aria-label={`QR code for ${name}'s page`} style={{ background:'#fff', borderRadius:12, padding:10, lineHeight:0, maxWidth:340, margin:'0 auto 14px' }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      <div style={{ display:'grid', gap:8 }}>
        <button style={{ ...btn('primary'), padding:14, fontSize:15 }} onClick={onShare}>Share link instead</button>
        <button style={{ ...btn(), padding:12 }} onClick={onClose}>Done</button>
      </div>
    </Sheet>
  )
}
