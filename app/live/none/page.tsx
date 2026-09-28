import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'No session running — The Shuttle Social' }

/** Where the laminated QR lands when no session was started in the last 12 hours. */
export default function NoSessionPage() {
  return (
    <main style={{ minHeight:'100vh', background:'#080f08', color:'#edf5ed', display:'grid', placeItems:'center',
      fontFamily:'DM Sans, system-ui, sans-serif', padding:20, boxSizing:'border-box' }}>
      <div style={{ maxWidth:360, textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:8 }} aria-hidden>🏸</div>
        <h1 style={{ fontSize:22, fontWeight:900, margin:'0 0 8px' }}>No session running right now</h1>
        <p style={{ color:'#6b8a6b', fontSize:15, lineHeight:1.5, margin:'0 0 20px' }}>
          This code opens the live session on the night. If you&apos;re at a session that has just started,
          ask the organiser to open it, then scan again.
        </p>
        <a href="/tickets" style={{ display:'block', padding:'14px', borderRadius:10, fontWeight:700, fontSize:16,
          textDecoration:'none', color:'#6fcf40', background:'rgba(111,207,64,0.1)', border:'1px solid rgba(111,207,64,0.25)' }}>
          Book your next session
        </a>
      </div>
    </main>
  )
}
