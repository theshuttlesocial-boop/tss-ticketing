'use client'
import { useEffect, useRef, useState } from 'react'
import { T, btn } from './theme'

/**
 * In-page round timer.
 *
 * A web page cannot start the iPhone's built-in Clock timer — iOS exposes no
 * public URL scheme for it, and anything claiming otherwise depends on the
 * user having installed a matching Shortcut. So this runs in the page instead:
 * it counts down, vibrates, and plays an alarm when the round is up. Keep the
 * tab open (leave the phone unlocked, or use the board on a laptop).
 */
export function RoundTimer({ minutes = 8, onEnd }: { minutes?: number; onEnd?: () => void }) {
  const [total, setTotal] = useState(minutes * 60)
  const [left, setLeft] = useState<number | null>(null)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (tick.current) clearInterval(tick.current) }, [])

  const alarm = () => {
    try { navigator.vibrate?.([400, 200, 400, 200, 600]) } catch { /* not supported */ }
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ac = new Ctx()
      ;[0, 0.45, 0.9].forEach((offset) => {
        const o = ac.createOscillator(), g = ac.createGain()
        o.type = 'sine'; o.frequency.value = 880
        g.gain.setValueAtTime(0.0001, ac.currentTime + offset)
        g.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + offset + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + offset + 0.34)
        o.connect(g); g.connect(ac.destination)
        o.start(ac.currentTime + offset); o.stop(ac.currentTime + offset + 0.36)
      })
    } catch { /* audio blocked */ }
  }

  const start = () => {
    if (tick.current) clearInterval(tick.current)
    setLeft(total)
    tick.current = setInterval(() => {
      setLeft((v) => {
        if (v === null) return v
        if (v <= 1) {
          if (tick.current) clearInterval(tick.current)
          alarm(); onEnd?.()
          return 0
        }
        return v - 1
      })
    }, 1000)
  }

  const stop = () => { if (tick.current) clearInterval(tick.current); setLeft(null) }

  const mm = left === null ? null : String(Math.floor(left / 60)).padStart(2, '0')
  const ss = left === null ? null : String(left % 60).padStart(2, '0')
  const done = left === 0

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      background: done ? T.dangerDim : T.card2,
      border:`1px solid ${done ? T.danger : T.border}`,
      borderRadius:10, padding:'10px 12px',
    }}>
      {left === null ? (
        <>
          <select value={total} onChange={e => setTotal(Number(e.target.value))}
            style={{ background:T.card, color:T.text, border:`1px solid ${T.border}`,
              borderRadius:8, padding:'8px 10px', fontSize:14, fontFamily:'inherit' }}>
            {[5,6,7,8,9,10,12].map(m => <option key={m} value={m*60}>{m} min</option>)}
          </select>
          <button style={btn('primary')} onClick={start}>Start round timer</button>
        </>
      ) : (
        <>
          <span style={{
            fontSize:30, fontWeight:900, fontVariantNumeric:'tabular-nums',
            color: done ? T.danger : left <= 30 ? T.warning : T.accent,
          }}>{mm}:{ss}</span>
          <span style={{ flex:1, fontSize:13, color:T.muted }}>
            {done ? "Round over" : 'Keep this tab open'}
          </span>
          <button style={btn()} onClick={stop}>{done ? 'Reset' : 'Stop'}</button>
        </>
      )}
    </div>
  )
}
