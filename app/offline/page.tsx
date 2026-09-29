export const metadata = { title: 'Offline — The Shuttle Social' }

/** Shown by the service worker when a page is opened with no connection. */
export default function Offline() {
  return (
    <main style={{ minHeight:'100vh', background:'#080f08', color:'#edf5ed', display:'grid', placeItems:'center',
      fontFamily:'DM Sans, system-ui, sans-serif', padding:20, boxSizing:'border-box', textAlign:'center' }}>
      <div style={{ maxWidth:340 }}>
        <img src="/icons/icon-192.png" alt="" width={88} height={88} style={{ borderRadius:20, marginBottom:14 }} />
        <h1 style={{ fontSize:22, fontWeight:900, margin:'0 0 8px' }}>You&apos;re offline</h1>
        <p style={{ color:'#6b8a6b', fontSize:15, lineHeight:1.5, margin:'0 0 18px' }}>
          Courts, scores and bookings need a connection. Check your signal or Wi-Fi, then try again.
        </p>
        <a href="" style={{ display:'block', padding:14, borderRadius:10, fontWeight:700, textDecoration:'none', color:'#6fcf40',
          background:'rgba(111,207,64,0.1)', border:'1px solid rgba(111,207,64,0.25)' }}>Try again</a>
      </div>
    </main>
  )
}
