'use client'
import { RequireTwoStep } from '@/app/_components/TwoStep'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { T, inp, cardStyle, btn } from '@/app/_design/theme'
import { StaffGate as Gate } from '../_components/StaffGate'
import { staffHeaders, whoAmI } from '@/lib/staffClient'

/**
 * Step 1 of a session: name it and open registration. Players then add
 * themselves via the QR and appear live on the session's admin page, where
 * the organiser can correct names and levels, add anyone who could not
 * register, and start the session.
 */
function LiveSetupPageInner() {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [name, setName] = useState('')
  const [courts, setCourts] = useState('4')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const s = sessionStorage.getItem('tss-admin-secret')
    if (s) { setSecret(s); setAuthed(true); return }
    whoAmI().then((w) => { if (w) setAuthed(true) })
  }, [])

  const create = async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', ...staffHeaders(secret) },
        body: JSON.stringify({ name: name.trim(), courts: Number(courts) || 4, roster: [] }),
      })
      const json = await res.json()
      if (res.status === 401) { setMsg(json.error ?? 'You can’t create a live session right now.'); sessionStorage.removeItem('tss-admin-secret'); setAuthed(false); return }
      if (!res.ok) { setMsg(json.error ?? 'Could not create session'); return }
      router.push(`/live/${json.id}/admin`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const unlock = () => { if (secret) { sessionStorage.setItem('tss-admin-secret', secret); setAuthed(true) } }
  const wrap: React.CSSProperties = { minHeight:'100vh', background:T.bg, color:T.text, padding:'24px 16px',
    fontFamily:'inherit', boxSizing:'border-box' }

  if (!authed) return <Gate secret={secret} setSecret={setSecret} setAuthed={setAuthed} title="New live session" />

  return (
    <div style={wrap}>
      <div style={{ maxWidth:520, margin:'0 auto' }}>
        <h1 style={{ fontSize:26, fontWeight:900, margin:'0 0 4px' }}>New live session</h1>
        <p style={{ color:T.muted, fontSize:14, margin:'0 0 18px' }}>
          Create the session, then show the QR code. Players register themselves with their
          name and level, and appear on the next screen as they finish. You can correct
          anyone&apos;s name or level, add people who can&apos;t register, then start.
        </p>
        {msg && <div style={{ background:T.dangerDim, border:`1px solid ${T.danger}`, color:T.danger,
          padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:14 }}>{msg}</div>}
        <section style={{ ...cardStyle, padding:16 }}>
          <label style={{ display:'block', marginBottom:12 }}>
            <span style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>
              Session name {!name.trim() && <span style={{ color:T.warning }}>· required</span>}
            </span>
            <input style={inp({ fontSize:16, padding:'12px' })} value={name}
              onChange={e => setName(e.target.value)} placeholder="Thursday Harrow" />
          </label>
          <label style={{ display:'block', marginBottom:16 }}>
            <span style={{ fontSize:12, color:T.muted, display:'block', marginBottom:5 }}>Courts</span>
            <input style={inp({ fontSize:16, padding:'12px' })} inputMode="numeric" value={courts}
              onChange={e => setCourts(e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
          <button style={{ ...btn('primary'), width:'100%', padding:'14px', fontSize:15 }}
            disabled={busy || !name.trim()} onClick={create}>
            {busy ? 'Creating…' : 'Create session & open registration'}
          </button>
        </section>
      </div>
    </div>
  )
}

/** Owners and admins pass the authenticator step first (Phase 5d). */
export default function LiveSetupPage() {
  return <RequireTwoStep><LiveSetupPageInner /></RequireTwoStep>
}
