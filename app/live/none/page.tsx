import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'No session running — The Shuttle Social' }

/** Where the laminated QR lands when no session was started in the last 12 hours. */
export default function NoSessionPage() {
  return (
    <main style={{ minHeight:'70vh', color:'var(--ink)', display:'grid', placeItems:'center',
      fontFamily:'inherit', padding:20, boxSizing:'border-box' }}>
      <div style={{ maxWidth:360, textAlign:'center' }}>
        <h1 style={{ fontSize:30, fontWeight:900, letterSpacing:'-0.03em', lineHeight:1.1, margin:'0 0 12px' }}>No session running right now</h1>
        <p style={{ color:'var(--muted)', fontSize:15, lineHeight:1.5, margin:'0 0 20px' }}>
          This code opens the live session on the night. If you&apos;re at a session that has just started,
          ask the organiser to open it, then scan again.
        </p>
        <a href="/tickets" style={{ display:'block', padding:'15px', borderRadius:999, fontWeight:800, fontSize:16,
          textDecoration:'none', color:'#0F2A1A', background:'linear-gradient(115deg, #F2FF9E 0%, #D9F46B 45%, #9FE8BE 100%)', boxShadow:'0 0 0 4px rgba(217,244,107,0.22), 0 16px 34px -12px rgba(190,240,90,0.75)' }}>
          Book your next session
        </a>
      </div>
    </main>
  )
}
