'use client'
import { useEffect, useState } from 'react'
import { T, btn } from '../live/_components/theme'

const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const set = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

/**
 * "Install the TSS app". Android/Chrome: one tap (the browser's own install
 * prompt). iPhone: Safari has no prompt, so it shows the two steps. Hidden once
 * installed, or after "Not now".
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<any>(null)
  const [ios, setIos] = useState(false)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches
    if (standalone || get('tss-install-dismissed') === '1') return
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
    setIos(isIos); if (isIos) setShow(true)
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    const onInstalled = () => setShow(false)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (!show) return null
  return (
    <section style={{ background:T.card, border:`1px solid ${T.accentBorder}`, borderRadius:12, padding:14, marginBottom:16, display:'flex', gap:12, alignItems:'flex-start' }}>
      <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius:10, flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <strong style={{ fontSize:15 }}>Get the TSS app</strong>
        {ios ? (
          <p style={{ color:T.muted, fontSize:13, margin:'4px 0 0', lineHeight:1.5 }}>
            In Safari, tap <strong style={{ color:T.text }}>Share</strong> <span aria-hidden>⬆︎</span> then{' '}
            <strong style={{ color:T.text }}>Add to Home Screen</strong>. It opens straight to your sessions — no App Store needed.
          </p>
        ) : (
          <p style={{ color:T.muted, fontSize:13, margin:'4px 0 8px', lineHeight:1.5 }}>Opens straight to your sessions, like an app. No App Store needed.</p>
        )}
        <div style={{ display:'flex', gap:8, marginTop: ios ? 10 : 0 }}>
          {!ios && prompt && (
            <button style={{ ...btn('primary'), minHeight:44 }}
              onClick={async () => { prompt.prompt(); await prompt.userChoice.catch(() => null); setPrompt(null); setShow(false) }}>
              Install
            </button>
          )}
          <button style={{ ...btn(), minHeight:44 }} onClick={() => { set('tss-install-dismissed', '1'); setShow(false) }}>Not now</button>
        </div>
      </div>
    </section>
  )
}
