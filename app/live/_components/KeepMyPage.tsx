'use client'
import { useEffect, useState } from 'react'
import { T, btn } from '@/app/_design/theme'

const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const set = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

/**
 * Bottom of a player's own page: ways not to lose it.
 *  - their PIN, if this phone was the one that registered (kept only on the phone)
 *  - Copy my link
 *  - on iPhone Safari, how to add the page to the Home Screen
 */
export function KeepMyPage({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const [pin, setPin] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState(false)

  useEffect(() => {
    setPin(get(`tss-live-pin:${sessionId}`))
    // Opening your own link on a new phone: remember it, so the session QR
    // brings this phone straight back here too.
    if (!get(`tss-live-player:${sessionId}`)) set(`tss-live-player:${sessionId}`, playerId)
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches
    setHint(ios && !standalone && get('tss-home-hint-dismissed') !== '1')
  }, [sessionId, playerId])

  const link = typeof window !== 'undefined' ? window.location.href : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500) }
    catch { window.prompt('Copy your link', link) }
  }

  return (
    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:'16px 18px', marginTop:14 }}>
      <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:8 }}>
        Keep this page
      </div>
      {pin && (
        <p style={{ fontSize:14, margin:'0 0 12px', lineHeight:1.5 }}>
          Your PIN is <strong style={{ fontSize:18, letterSpacing:'3px', color:T.accent }}>{pin}</strong>. On another phone,
          scan the QR, tap “Already registered?” and enter your name and PIN.
        </p>
      )}
      <button style={{ ...btn(), width:'100%', minHeight:48, fontSize:15 }} onClick={copy}>
        {copied ? '✓ Link copied' : 'Copy my link'}
      </button>
      {hint && (
        <div style={{ marginTop:12, fontSize:13, color:T.muted, lineHeight:1.5, display:'flex', gap:10, alignItems:'flex-start' }}>
          <span style={{ flex:1 }}>
            Tip: tap <strong style={{ color:T.text }}>Share</strong> <span aria-hidden>⬆︎</span> then{' '}
            <strong style={{ color:T.text }}>Add to Home Screen</strong> to open this page like an app.
          </span>
          <button aria-label="Dismiss tip" onClick={() => { set('tss-home-hint-dismissed', '1'); setHint(false) }}
            style={{ background:'none', border:'none', color:T.muted, fontSize:18, cursor:'pointer', padding:'0 4px', minHeight:32 }}>×</button>
        </div>
      )}
    </div>
  )
}
