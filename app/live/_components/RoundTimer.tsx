'use client'
import { useEffect, useRef, useState } from 'react'
import { T, btn } from '@/app/_design/theme'
import { remaining, timerStatus, fmt, shortcutUrl, TimerAction, TimerState } from '@/lib/live-session/timer'

/**
 * Round timer, stored on the server. Every screen computes the time left from
 * the same fields and the server's clock, so reloading, leaving the page or
 * picking up another phone shows the right time.
 *
 *  - admin:  controls; the alarm plays here (AudioContext unlocked by the tap)
 *            and the screen is kept awake while it runs.
 *  - board:  big display; plays the alarm once someone taps "turn on sound"
 *            (browsers only allow sound after a tap on that screen).
 *  - player: display only.
 */
export function RoundTimer({ timer, round, offset, mode, onAction }: {
  timer?: TimerState
  round?: number
  offset: number
  mode: 'admin' | 'board' | 'player'
  onAction?: (a: TimerAction) => Promise<unknown>
}) {
  const [now, setNow] = useState(() => Date.now())
  const [minutes, setMinutes] = useState(8)
  const [soundOn, setSoundOn] = useState(false)
  const audio = useRef<any>(null)
  const wake = useRef<any>(null)
  const prevLeft = useRef<number | null>(null)
  const rang = useRef<string>('')

  const status = timerStatus(timer)
  const left = remaining(timer, now + offset)
  const done = status === 'running' && left === 0

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])

  // iOS only lets a page play sound from an AudioContext created or resumed
  // during a tap; creating it at alarm time is silently muted.
  const unlock = () => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (Ctx && !audio.current) audio.current = new Ctx()
      audio.current?.resume?.()
    } catch { /* no audio */ }
  }
  const keepAwake = () => {
    try { (navigator as any).wakeLock?.request?.('screen').then((w: any) => { wake.current = w }).catch(() => {}) } catch { /* unsupported */ }
  }
  const release = () => { try { wake.current?.release?.() } catch { /* ignore */ } wake.current = null }

  // Screen on while the timer runs (admin and board); wake locks drop when the
  // page is hidden, so take it again on return.
  useEffect(() => {
    if (mode === 'player') return
    if (status === 'running' && !done && (mode === 'admin' || soundOn)) keepAwake(); else release()
    const onShow = () => { if (document.visibilityState === 'visible' && status === 'running') keepAwake() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [status, done, mode, soundOn])
  useEffect(() => () => release(), [])

  // Ring once per run, and only when this screen watched it reach zero — a
  // reload after the round ended must not ring again.
  useEffect(() => {
    const key = `${round}:${timer?.startedAt}:${timer?.remainingS}`
    if (left === 0 && (prevLeft.current ?? 0) > 0 && rang.current !== key && status === 'running') {
      rang.current = key
      if (mode !== 'player') alarm(audio.current)
    }
    prevLeft.current = left
  }, [left, round, timer, status, mode])

  const act = (a: TimerAction) => { unlock(); return onAction?.(a) }

  const colour = done ? T.danger : status === 'paused' ? T.muted : (left ?? 99) <= 30 ? T.warning : T.accent

  if (mode !== 'admin') {
    if (status === 'idle') return mode === 'board' ? <SoundButton on={soundOn} set={() => { unlock(); keepAwake(); setSoundOn(true) }} /> : null
    const big = mode === 'board'
    return (
      <div style={{ display:'flex', alignItems:'center', gap: big ? 18 : 10 }}>
        <span style={{ fontSize: big ? 64 : 30, fontWeight:900, fontVariantNumeric:'tabular-nums', color: colour, lineHeight:1 }}>
          {fmt(left)}
        </span>
        <span style={{ fontSize: big ? 20 : 13, color: done ? T.danger : T.muted }}>
          {done ? 'Round over' : status === 'paused' ? 'Paused' : 'left this round'}
        </span>
        {mode === 'board' && !soundOn && <SoundButton on={false} set={() => { unlock(); keepAwake(); setSoundOn(true) }} />}
      </div>
    )
  }

  return (
    <div style={{ background: done ? T.dangerDim : T.card2, border:`1px solid ${done ? T.danger : T.border}`,
      borderRadius:10, padding:'10px 12px' }}>
      {status === 'idle' ? (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <select aria-label="Round length" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
              style={{ background:T.card, color:T.text, border:`1px solid ${T.border}`, borderRadius:8,
                padding:'10px', fontSize:15, fontFamily:'inherit', minHeight:44 }}>
              {[5, 6, 7, 8, 9, 10, 12, 15].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
            <button style={{ ...btn('primary'), flex:1, minHeight:44 }} disabled={round == null}
              onClick={() => {
                const seconds = minutes * 60
                const p = act({ action: 'start', seconds })
                // Open the Shortcut straight from the tap (iOS needs a gesture);
                // the start request is already on its way.
                if (iphoneTimerOn()) { void p; window.location.href = shortcutUrl(seconds) }
              }}>
              {round == null ? 'Draw a round first' : 'Start round timer'}
            </button>
          </div>
          <IphoneToggle />
        </>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:34, fontWeight:900, fontVariantNumeric:'tabular-nums', color: colour }}>{fmt(left)}</span>
            <span style={{ flex:1, fontSize:13, color: done ? T.danger : T.muted }}>
              {done ? 'Round over' : status === 'paused' ? 'Paused — every screen shows this' : 'Shown on every screen · safe to leave this page'}
            </span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
            {status === 'paused'
              ? <button style={{ ...btn('primary'), minHeight:44 }} onClick={() => act({ action: 'resume' })}>Resume</button>
              : <button style={{ ...btn(), minHeight:44 }} disabled={done} onClick={() => act({ action: 'pause' })}>Pause</button>}
            <button style={{ ...btn(), minHeight:44 }} onClick={() => act({ action: 'add', seconds: 60 })}>+1 min</button>
            <button style={{ ...btn(), minHeight:44 }} onClick={() => { if (done || confirm('Reset the timer?')) act({ action: 'reset' }) }}>Reset</button>
          </div>
        </div>
      )}
    </div>
  )
}

function alarm(ac: any) {
  try { navigator.vibrate?.([400, 200, 400, 200, 600]) } catch { /* not supported */ }
  try {
    if (!ac) return
    ac.resume?.()
    ;[0, 0.45, 0.9, 1.6, 2.05, 2.5].forEach((offset) => {
      const o = ac.createOscillator(), g = ac.createGain()
      o.type = 'sine'; o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, ac.currentTime + offset)
      g.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + offset + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + offset + 0.34)
      o.connect(g); g.connect(ac.destination)
      o.start(ac.currentTime + offset); o.stop(ac.currentTime + offset + 0.36)
    })
  } catch { /* audio blocked */ }
}

function SoundButton({ on, set }: { on: boolean; set: () => void }) {
  if (on) return null
  return (
    <button onClick={set} style={{ ...btn(), fontSize:16, padding:'10px 16px' }}>
      🔔 Tap to turn on the round-end sound
    </button>
  )
}

/* ── "Also start iPhone timer" ─────────────────────────────────────────── */

const KEY = 'tss-iphone-timer'
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}
const isIOS = () => typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
export const iphoneTimerOn = () => isIOS() && store.get(KEY) === '1'

/**
 * Remembered per device. When on, Start also opens the "TSS Round" Shortcut,
 * which starts the iPhone's own Clock timer — that one rings even with the
 * phone locked. Hidden on anything that isn't an iPhone or iPad.
 */
function IphoneToggle() {
  const [ios, setIos] = useState(false)
  const [on, setOn] = useState(false)
  const [help, setHelp] = useState(false)
  useEffect(() => { setIos(isIOS()); setOn(store.get(KEY) === '1') }, [])
  if (!ios) return null
  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, fontSize:13 }}>
        <label style={{ display:'flex', gap:8, alignItems:'center', flex:1, cursor:'pointer', minHeight:36 }}>
          <input type="checkbox" checked={on} style={{ width:20, height:20 }} onChange={(e) => {
            setOn(e.target.checked); store.set(KEY, e.target.checked ? '1' : '0')
            if (e.target.checked && store.get(KEY + '-help') !== '1') setHelp(true)
          }} />
          Also start iPhone timer
        </label>
        <button onClick={() => setHelp(true)} style={{ background:'none', border:'none', color:T.info, fontSize:13, cursor:'pointer', padding:8 }}>
          How to set up
        </button>
      </div>
      {help && <ShortcutHelp onClose={() => { store.set(KEY + '-help', '1'); setHelp(false) }} />}
    </>
  )
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Set up the iPhone timer" onClick={onClose}
      style={{ position:'fixed', inset:0, background:'var(--overlay)', zIndex:70, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background:T.card, borderRadius:'16px 16px 0 0', width:'100%', maxWidth:560,
        padding:'18px 16px calc(18px + env(safe-area-inset-bottom))', color:T.text, fontFamily:'inherit', fontSize:15, lineHeight:1.5 }}>
        <h2 style={{ fontSize:19, fontWeight:900, margin:'0 0 8px' }}>Set up the iPhone timer (once)</h2>
        <p style={{ color:T.muted, margin:'0 0 12px' }}>
          Websites can&apos;t start the Clock app themselves, so this uses a Shortcut. Make it once on this iPhone:
        </p>
        <ol style={{ paddingLeft:20, margin:'0 0 12px' }}>
          <li>Open the <strong>Shortcuts</strong> app and tap <strong>+</strong>.</li>
          <li>Name it exactly <strong>TSS Round</strong>.</li>
          <li>Add the action <strong>Get Numbers from Input</strong>.</li>
          <li>Add the action <strong>Start Timer</strong>, tap its duration, choose the <strong>Numbers</strong> variable and set the unit to <strong>minutes</strong>.</li>
          <li>Tap <strong>Done</strong>.</li>
        </ol>
        <p style={{ color:T.muted, margin:'0 0 14px' }}>
          Now, with this switch on, <strong>Start round timer</strong> also opens Shortcuts and starts a Clock timer for the same
          length, which rings even if the phone locks. The first time, iPhone asks to allow it: tap <strong>Allow</strong>.
          Pause and +1 min only change the shared timer, not the Clock one.
        </p>
        <button style={{ ...btn('primary'), width:'100%', padding:14 }} onClick={onClose}>Got it</button>
      </div>
    </div>
  )
}
