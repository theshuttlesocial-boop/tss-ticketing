'use client'
import { useMemo, useState } from 'react'
import { T, btn } from '@/app/_design/theme'
import { flagGames, reviewLevels, replay, roundComplete } from '@/lib/live-session/engine'
import type { Level, Session } from '@/lib/live-session/engine'
import type { LiveMeta } from '../../_hooks/useLiveSession'

const L = (l?: Level | null) => (l ? l[0].toUpperCase() + l.slice(1) : '?')
const STALE_HOURS = 3

type Item = {
  key: string
  tone: 'warn' | 'info' | 'bad'
  text: string
  actions: { label: string; primary?: boolean; run: () => void }[]
}

/**
 * "Needs attention" — the top of the admin page during a session.
 *
 * Everything the organiser should know about but might not notice: automatic
 * level moves (already made, or about to be at the next draw), suggested
 * moves in suggest-only mode, badly matched games, and a session that has gone
 * quiet. Each item is one sentence with one-tap actions; dismissals are stored
 * on the server so every admin phone agrees.
 */
export function Attention({ session, meta, busy, nm, gone, post, patchPlayer, onFinish }: {
  session: Session
  meta: LiveMeta
  busy: boolean
  nm: (id: string) => string
  gone: Set<string>
  /** POST /attention */
  post: (body: Record<string, unknown>) => void
  /** PATCH /players */
  patchPlayer: (body: Record<string, unknown>) => void
  onFinish: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const cfg = session.config as any
  const dismissed = useMemo(() => new Set<string>(cfg.dismissed ?? []), [cfg.dismissed])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const rp = (() => { try { return replay(session) } catch { return null } })()
    if (!rp) return out
    const P = session.players
    const lock = (id: string) => ({ label: 'Lock level', run: () => patchPlayer({ player_id: id, locked: true }) })
    const dismiss = (key: string, text: string, label = 'Dismiss') => ({ label, run: () => post({ action: 'dismiss', key, text }) })

    // Quiet session: live, nothing logged for 3+ hours.
    if (meta.status === 'live' && meta.lastActivityAt) {
      const h = (Date.now() - new Date(meta.lastActivityAt).getTime()) / 3_600_000
      if (h >= STALE_HOURS) out.push({ key: 'stale', tone: 'warn',
        text: `Nothing has happened for ${Math.floor(h)} hours. If tonight is over, finish the session so the QR code stops opening it. (It finishes itself 6 hours after the last score.)`,
        actions: [{ label: 'Finish session', primary: true, run: onFinish }] })
    }

    // Automatic moves already made.
    for (const p of Object.values(P)) {
      const changes = p.levelChanges ?? []
      changes.forEach((c, i) => {
        if (c.by !== 'system') return
        const key = `lvl:${p.id}:${c.beforeRound}`
        if (dismissed.has(key)) return
        const isLast = i === changes.length - 1
        const down = c.to === 'beginner'
        const text = `${nm(p.id)} picked ${L(p.registeredLevel ?? p.startLevel)}. ${c.reason ?? ''}${c.reason ? ', ' : ''}playing like ${L(c.to)}. Moved to ${L(c.to)} from Round ${c.beforeRound}.` +
          (down ? ' Now kept away from Strong players.' : '')
        out.push({ key, tone: down ? 'bad' : 'info', text, actions: [
          dismiss(key, `Kept: ${p.name} ${L(c.from)} → ${L(c.to)}`, 'Keep'),
          ...(isLast ? [{ label: 'Undo', run: () => post({ action: 'undo', player_id: p.id }) }] : []),
          ...(!p.levelLocked ? [lock(p.id)] : []),
        ] })
      })
    }

    // What the review will do at the next draw.
    const current = session.rounds.length
    if (current > 0 && roundComplete(session, current) && !(cfg.finalRound && cfg.finalRound <= current)) {
      const blocked = new Set<string>(cfg.blockedMoves ?? [])
      for (const pr of reviewLevels(session, { exclude: gone, blocked, rp })) {
        const key = `sug:${pr.playerId}:${pr.to}:${current + 1}`
        if (dismissed.has(key)) continue
        const who = `${nm(pr.playerId)} picked ${L(P[pr.playerId]?.registeredLevel ?? pr.from)}. After ${pr.games} games (rating ${Math.round(pr.rating)}) they're playing like ${L(pr.to)}.`
        out.push(pr.auto
          ? { key, tone: 'info', text: `${who} Moves to ${L(pr.to)} when you draw Round ${current + 1}.`, actions: [lock(pr.playerId)] }
          : { key, tone: 'info', text: `${who} Suggest moving to ${L(pr.to)}.`, actions: [
              { label: `Apply`, primary: true, run: () => post({ action: 'apply', player_id: pr.playerId, to: pr.to }) },
              dismiss(key, `Not moved: ${P[pr.playerId]?.name} → ${L(pr.to)}`),
              lock(pr.playerId),
            ] })
      }
    }

    // Badly matched games, newest first.
    for (const g of flagGames(session, rp).reverse()) {
      const key = `game:${g.round}:${g.court}`
      if (dismissed.has(key)) continue
      const res = session.results.find((r) => r.round === g.round && r.court === g.court)
      if (!res) continue
      const c = g.cause
      const score = `${Math.max(res.scoreA, res.scoreB)}–${Math.min(res.scoreA, res.scoreB)}`
      const why = g.margin >= (cfg.levels?.mismatchMargin ?? 12) ? 'a one-sided game' : 'further from even than the ratings expected'
      const cause = c ? ` Most likely: ${nm(c.playerId)} (${L(c.level)}, rating ${Math.round(c.rating)}${c.suggest ? `, playing like ${L(c.suggest)}` : ''}).` : ''
      out.push({ key, tone: 'warn', text: `Round ${g.round}, court ${g.court} finished ${score} — ${why}.${cause}`, actions: [
        ...(c?.suggest && !gone.has(c.playerId) && !P[c.playerId]?.levelLocked
          ? [{ label: `Move ${nm(c.playerId)} to ${L(c.suggest)}`, primary: true,
              run: () => patchPlayer({ player_id: c.playerId, level: c.suggest }) }] : []),
        dismiss(key, `Game R${g.round} C${g.court} reviewed`),
      ] })
    }
    return out
  }, [session, meta, dismissed, gone, nm, post, patchPlayer, onFinish, cfg])

  if (!items.length) return null
  const shown = showAll ? items : items.slice(0, 4)
  const tone = { warn: T.warning, info: T.info, bad: T.danger }
  return (
    <section aria-label="Needs attention" style={{ background:T.card, border:`1px solid ${T.warning}`, borderRadius:12,
      padding:12, marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:800, letterSpacing:'1px', textTransform:'uppercase', color:T.warning, marginBottom:8 }}>
        Needs attention · {items.length}
      </div>
      <div style={{ display:'grid', gap:8 }}>
        {shown.map((it) => (
          <div key={it.key} style={{ background:T.card2, borderLeft:`3px solid ${tone[it.tone]}`, borderRadius:8, padding:'10px 11px' }}>
            <div style={{ fontSize:14, lineHeight:1.45, marginBottom: it.actions.length ? 9 : 0 }}>{it.text}</div>
            {it.actions.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {it.actions.map((a) => (
                  <button key={a.label} disabled={busy} onClick={a.run}
                    style={{ ...btn(a.primary ? 'primary' : 'ghost'), padding:'10px 14px', minHeight:44 }}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {items.length > 4 && (
        <button style={{ ...btn(), width:'100%', marginTop:8, minHeight:44 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  )
}
