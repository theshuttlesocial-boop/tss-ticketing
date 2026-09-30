'use client'
import { T, inp, cardStyle, btn } from '@/app/_design/theme'

/**
 * Sign-in box for the live-session admin and setup pages: the staff email
 * code (Phase 5), with the old shared password tucked away as the owner-only
 * emergency fallback.
 */
export function StaffGate({ secret, setSecret, setAuthed, title = 'Live session admin' }: any) {
  const unlock = () => { if (secret) { sessionStorage.setItem('tss-admin-secret', secret); setAuthed(true) } }
  const here = typeof window !== 'undefined' ? window.location.pathname : '/live/setup'
  return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'grid', placeItems:'center',
      fontFamily:'inherit', padding:20 }}>
      <div style={{ ...cardStyle, padding:22, width:'100%', maxWidth:330 }}>
        <h1 style={{ color:T.text, fontSize:19, margin:'0 0 14px' }}>{title}</h1>
        <a href={`/account?next=${encodeURIComponent(here)}`} style={{ ...btn('primary'), display:'block', textAlign:'center',
          textDecoration:'none', padding:'14px', fontSize:15 }}>Sign in with your staff email</a>
        <details style={{ marginTop:14 }}>
          <summary style={{ cursor:'pointer', fontSize:12, color:T.muted }}>Emergency owner password</summary>
          <input type="password" placeholder="Admin password" style={inp({ fontSize:16, padding:'13px', marginTop:10 })}
            value={secret} onChange={e => setSecret(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') unlock() }} />
          <button style={{ ...btn(), width:'100%', marginTop:10, padding:'12px' }} disabled={!secret}
            onClick={unlock}>Use password</button>
        </details>
      </div>
    </div>
  )
}
