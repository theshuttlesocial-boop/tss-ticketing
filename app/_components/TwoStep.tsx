'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { whoAmI, staffHeadersReady } from '@/lib/staffClient'
import { T, btn, inp } from '@/app/_design/theme'

/**
 * Two-step login for owners and admins (Roadmap Phase 5d).
 *
 * Wrap a staff page in <RequireTwoStep>. If the signed-in person is an owner
 * or admin who hasn't entered their authenticator code this session, they get
 * this screen first: a QR code to set up the app the first time, the 6-digit
 * code after that. The server refuses them regardless until it's done
 * (lib/staff.ts) — this screen is the way through, not the protection.
 */
export function RequireTwoStep({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'needed' | 'ok'>('checking')
  useEffect(() => { whoAmI().then((w) => setState(w?.mfa === 'needed' ? 'needed' : 'ok')) }, [])
  if (state === 'checking') return <div style={{ minHeight:'100vh', background:T.bg }} />
  if (state === 'needed') return <TwoStep onDone={() => setState('ok')} />
  return <>{children}</>
}

function TwoStep({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors()
      const ready = data?.totp?.find((f) => f.status === 'verified')
      if (ready) { setFactorId(ready.id); return }
      // First time: clear any half-finished setup, then start a fresh one.
      for (const f of data?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data: en, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `TSS ${new Date().toISOString().slice(0, 10)}` })
      if (error || !en) { setErr(error?.message ?? 'Could not start set-up'); return }
      setFactorId(en.id); setQr(en.totp.qr_code); setSecret(en.totp.secret)
    })()
  }, [])

  const verify = async () => {
    if (!factorId) return
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (error) { setBusy(false); setErr('That code didn’t work. Use the newest code in your app (they change every 30 seconds).'); return }
    await staffHeadersReady()
    const w = await whoAmI()
    setBusy(false)
    if (w?.mfa === 'ok') onDone(); else setErr('Signed in, but the server didn’t accept it yet. Try again in a moment.')
  }

  return (
    <main style={{ minHeight:'100vh', background:T.bg, color:T.text, display:'grid', placeItems:'center', padding:20,
      fontFamily:'inherit', boxSizing:'border-box' }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <h1 style={{ fontSize:24, fontWeight:900, margin:'0 0 6px' }}>{qr ? 'Set up two-step login' : 'Enter your code'}</h1>
        {qr ? (
          <>
            <p style={{ color:T.muted, fontSize:14, lineHeight:1.5, margin:'0 0 12px' }}>
              Owners and admins protect the club&apos;s bookings and payments with a second step. Once only:
              open an authenticator app — the iPhone&apos;s <strong style={{ color:T.text }}>Passwords</strong> app,
              Google Authenticator or Microsoft Authenticator — and scan this.
            </p>
            <div style={{ background:'#fff', borderRadius:12, padding:10, width:220, margin:'0 auto 10px' }}>
              <img src={qr} alt="QR code to add The Shuttle Social to your authenticator app" width={200} height={200} />
            </div>
            <details style={{ marginBottom:12, fontSize:13, color:T.muted }}>
              <summary style={{ cursor:'pointer' }}>Can&apos;t scan? Type this key instead</summary>
              <code style={{ display:'block', marginTop:6, wordBreak:'break-all', color:T.text, fontSize:14 }}>{secret}</code>
            </details>
            <p style={{ color:T.muted, fontSize:14, margin:'0 0 8px' }}>Then type the 6-digit code it shows:</p>
          </>
        ) : (
          <p style={{ color:T.muted, fontSize:14, margin:'0 0 12px' }}>Open your authenticator app and type the 6-digit code for The Shuttle Social.</p>
        )}
        {err && <div role="alert" style={{ color:T.danger, fontSize:14, marginBottom:10 }}>{err}</div>}
        <input aria-label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) verify() }}
          style={inp({ fontSize:28, padding:'14px', letterSpacing:'10px', textAlign:'center', marginBottom:12 })} />
        <button style={{ ...btn('primary'), width:'100%', padding:15, fontSize:16 }} disabled={busy || code.length !== 6 || !factorId} onClick={verify}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <p style={{ color:T.muted, fontSize:12, marginTop:14, lineHeight:1.5 }}>
          Lost your phone? Another owner can reset your two-step login from the Staff page.
        </p>
      </div>
    </main>
  )
}
