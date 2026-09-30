export const metadata = { title: 'Offline — The Shuttle Social' }

/** Shown by the service worker when a page is opened with no connection. */
export default function Offline() {
  return (
    <main style={{ minHeight:'100vh', background:'linear-gradient(160deg, #0B2416 0%, #0E3B24 60%, #155A34 100%)', color:'#F4F7EC', display:'grid', placeItems:'center',
      fontFamily:'Urbanist, system-ui, sans-serif', padding:20, boxSizing:'border-box', textAlign:'center' }}>
      <div style={{ maxWidth:340 }}>
        <img src="/icons/icon-192.png" alt="" width={88} height={88} style={{ borderRadius:20, marginBottom:14 }} />
        <h1 style={{ fontSize:22, fontWeight:900, margin:'0 0 8px' }}>You&apos;re offline</h1>
        <p style={{ color:'rgba(244,247,236,0.8)', fontSize:15, lineHeight:1.5, margin:'0 0 18px' }}>
          Courts, scores and bookings need a connection. Check your signal or Wi-Fi, then try again.
        </p>
        <a href="" style={{ display:'block', padding:15, borderRadius:999, fontWeight:800, textDecoration:'none', color:'#0F2A1A',
          background:'linear-gradient(115deg, #F2FF9E 0%, #D9F46B 45%, #9FE8BE 100%)', boxShadow:'0 16px 34px -12px rgba(190,240,90,0.75)' }}>Try again</a>
      </div>
    </main>
  )
}
