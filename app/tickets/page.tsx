'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ── Midnight Green Theme ──────────────────────────────────────────────────────
const T = {
  bg:'#080f08', card:'#0f180f', card2:'#142014', border:'#1e3220', borderHover:'#2d4a2d',
  accent:'#6fcf40', accentDim:'rgba(111,207,64,0.1)', accentBorder:'rgba(111,207,64,0.25)',
  text:'#edf5ed', muted:'#6b8a6b', danger:'#e05555', dangerDim:'rgba(224,85,85,0.1)',
  warning:'#e09040', info:'#60b4ff', infoDim:'rgba(96,180,255,0.08)',
}
const inp = (extra?:object):React.CSSProperties => ({ width:'100%', background:'#142014', border:`1px solid ${T.border}`, borderRadius:8, padding:'10px 13px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit', ...extra })

interface Session {
  id:string; title:string; label?:string; venue:string; region:string
  date:string; time:string; capacity:number; price_pence:number
  status:string; booked:number; held:number; available:number
  description?:string; waitlist_count:number; opens_at?:string; image_url?:string; max_tickets_per_order?:number; maps_url?:string
}

const fmt = (p:number) => `£${(p/100).toFixed(2)}`
const fmtDateLong = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
const fmtDateShort = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})
const getDayNum = (d:string) => new Date(d).getDate()
const getMonth = (d:string) => new Date(d).toLocaleString('en-GB',{month:'short'}).toUpperCase()

// ── Schema.org structured data for SEO ───────────────────────────────────────
function SessionSchema({ session }: { session: Session }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": session.title,
    "startDate": `${session.date}T${session.time}`,
    "location": {
      "@type": "Place",
      "name": session.venue,
      "address": { "@type": "PostalAddress", "addressLocality": "London", "addressCountry": "GB" }
    },
    "organizer": { "@type": "Organization", "name": "The Shuttle Social", "url": "https://theshuttlesocial.com" },
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "offers": { "@type": "Offer", "price": (session.price_pence/100).toFixed(2), "priceCurrency": "GBP",
      "availability": session.available > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut" }
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(schema)}}/>
}

// ── Social media SVG icons (no image files, always clean on dark BG) ──────────
function SocialIcon({ platform, size=18 }: { platform:'whatsapp'|'instagram'|'tiktok'; size?:number }) {
  if (platform==='whatsapp') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
  if (platform==='instagram') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/>
    </svg>
  )
}

// ── Share buttons ─────────────────────────────────────────────────────────────
function ShareButtons({ session }: { session: Session }) {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const urlEnc = encodeURIComponent(url)
  const text = encodeURIComponent(`🏸 ${session.title} — ${fmtDateLong(session.date)} at ${session.venue}. Book now: `)

  const links = [
    { platform:'whatsapp' as const, href:`https://wa.me/?text=${text}${urlEnc}`, aria:'WhatsApp', bg:'#25d366' },
    { platform:'instagram' as const, href:`https://instagram.com/theshuttlesocial`, aria:'Instagram', bg:'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' },
    { platform:'tiktok' as const, href:`https://tiktok.com/@theshuttlesocial`, aria:'TikTok', bg:'#010101' },
  ]

  return (
    <div style={{display:'flex',gap:8,alignItems:'center',marginTop:9}}>
      <span style={{fontSize:11,color:T.muted}}>Share:</span>
      {links.map(l=>(
        <a key={l.aria} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.aria}
          style={{width:26,height:26,borderRadius:'50%',background:l.bg,display:'flex',alignItems:'center',justifyContent:'center',textDecoration:'none',flexShrink:0}}>
          <SocialIcon platform={l.platform} size={14}/>
        </a>
      ))}
    </div>
  )
}

// ── Map embed ─────────────────────────────────────────────────────────────────
function VenueMap({ venue, maps_url }: { venue: string; maps_url?: string }) {
  const q = encodeURIComponent(`${venue}, London, UK`)
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  const openUrl = maps_url ?? `https://www.google.com/maps/search/?api=1&query=${q}`
  return (
    <div style={{marginTop:16,borderRadius:10,overflow:'hidden',border:`1px solid ${T.border}`}}>
      <iframe
        title={`Map of ${venue}`}
        width="100%" height="220" frameBorder="0" style={{border:0,display:'block'}}
        src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}`}
        allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade"
      />
      <a href={openUrl} target="_blank" rel="noopener noreferrer"
        style={{display:'block',padding:'8px 12px',background:T.card2,fontSize:12,color:T.accent,textDecoration:'none',borderTop:`1px solid ${T.border}`}}>
        📍 Open in Google Maps →
      </a>
    </div>
  )
}

// ── Coming Soon Countdown ─────────────────────────────────────────────────────
function ComingSoonCountdown({ opensAt, onUnlocked }: { opensAt: string; onUnlocked: () => void }) {
  const [secsLeft, setSecsLeft] = useState(() => Math.max(0, Math.floor((new Date(opensAt).getTime() - Date.now()) / 1000)))
  const firedRef = useRef(false)
  const cbRef = useRef(onUnlocked)
  useEffect(() => { cbRef.current = onUnlocked }, [onUnlocked])

  useEffect(() => {
    const tick = () => {
      const s = Math.max(0, Math.floor((new Date(opensAt).getTime() - Date.now()) / 1000))
      setSecsLeft(s)
      if (s <= 0 && !firedRef.current) { firedRef.current = true; cbRef.current() }
    }
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [opensAt])

  if (secsLeft > 86400) {
    const d = new Date(opensAt)
    const dateStr = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
    const timeStr = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false })
    return <span>Opens {dateStr} at {timeStr}</span>
  }
  const h = Math.floor(secsLeft / 3600)
  const m = Math.floor((secsLeft % 3600) / 60)
  const s = secsLeft % 60
  return <span>Opens in {h > 0 ? `${h}h ` : ''}{m}m {String(s).padStart(2,'0')}s</span>
}

// ── Checkout Form ─────────────────────────────────────────────────────────────
function CheckoutForm({ bookingRef, expiresAt, onSuccess }:{bookingRef:string;expiresAt:string;onSuccess:()=>void}) {
  const stripe=useStripe(); const elements=useElements()
  const [paying,setPaying]=useState(false); const [error,setError]=useState('')
  const [secs,setSecs]=useState(()=>Math.max(0,Math.floor((new Date(expiresAt).getTime()-Date.now())/1000)))
  useEffect(()=>{const t=setInterval(()=>setSecs(s=>Math.max(0,s-1)),1000);return()=>clearInterval(t)},[])
  const mm=String(Math.floor(secs/60)).padStart(2,'0'), ss=String(secs%60).padStart(2,'0')
  async function pay(){
    if(!stripe||!elements)return; setPaying(true); setError('')
    const {error:e}=await stripe.confirmPayment({elements,confirmParams:{return_url:`${window.location.origin}/tickets/success?ref=${bookingRef}`},redirect:'if_required'})
    if(e){setError(e.message??'Payment failed');setPaying(false)}else onSuccess()
  }
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',background:T.accentDim,border:`1px solid ${T.accentBorder}`,borderRadius:8,marginBottom:16,alignItems:'center'}}>
        <span style={{fontSize:13,color:T.muted}}>⏱ Seat held for</span>
        <span style={{fontFamily:'monospace',fontSize:20,color:secs<60?T.danger:T.accent,fontWeight:700}}>{mm}:{ss}</span>
      </div>
      <PaymentElement options={{layout:'tabs'}}/>
      {error&&<div style={{marginTop:12,padding:'10px 14px',background:T.dangerDim,border:`1px solid rgba(224,85,85,0.3)`,borderRadius:8,color:T.danger,fontSize:13}}>{error}</div>}
      <button onClick={pay} disabled={paying||!stripe} style={{marginTop:16,width:'100%',padding:'14px',borderRadius:10,background:paying?T.border:T.accent,color:paying?T.muted:'#080f08',border:'none',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>
        {paying?'Processing…':'Confirm & Pay'}
      </button>
    </div>
  )
}

// ── Waitlist Modal ────────────────────────────────────────────────────────────
function WaitlistModal({session,onClose}:{session:Session;onClose:()=>void}){
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [phone,setPhone]=useState('')
  const [loading,setLoading]=useState(false); const [done,setDone]=useState<number|null>(null); const [error,setError]=useState('')
  async function join(){
    setLoading(true);setError('')
    const res=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:session.id,name,email,phone})})
    const d=await res.json()
    if(!res.ok){setError(d.error??'Failed');setLoading(false);return}
    setDone(d.position);setLoading(false)
  }
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,width:'100%',maxWidth:440,padding:28,position:'relative'}}>
        <button onClick={onClose} style={{position:'absolute',top:16,right:16,background:'none',border:'none',color:T.muted,fontSize:22,cursor:'pointer'}} aria-label="Close">✕</button>
        {done?(
          <div style={{textAlign:'center',padding:'10px 0'}}>
            <div style={{fontSize:48,fontWeight:900,color:T.accent,marginBottom:8}}>#{done}</div>
            <div style={{fontSize:20,fontWeight:700,color:T.text,marginBottom:8}}>You're on the waitlist!</div>
            <div style={{color:T.muted,fontSize:13,marginBottom:20}}>We'll email you immediately if a spot opens up.</div>
            <button onClick={onClose} style={{padding:'12px 28px',background:T.accent,color:'#080f08',border:'none',borderRadius:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Done</button>
          </div>
        ):(
          <>
            <div style={{fontWeight:700,fontSize:18,color:T.accent,marginBottom:4}}>🎯 Join Waitlist</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:20}}>{session.title} · {fmtDateShort(session.date)}</div>
            {[['Full Name *','text',name,setName,'Your name'],['Email *','email',email,setEmail,'you@email.com'],['Phone *','tel',phone,setPhone,'+44 7700 000000']].map(([l,t,v,sv,ph])=>(
              <div key={l as string} style={{marginBottom:14}}>
                <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5}}>{l as string}</label>
                <input type={t as string} value={v as string} onChange={e=>(sv as any)(e.target.value)} placeholder={ph as string} style={inp()}/>
              </div>
            ))}
            {error&&<div style={{color:T.danger,fontSize:13,marginBottom:12}}>{error}</div>}
            <button onClick={join} disabled={!name||!email||!phone||loading} style={{width:'100%',padding:'12px',background:(!name||!email||!phone||loading)?T.border:T.accent,color:(!name||!email||!phone||loading)?T.muted:'#080f08',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>
              {loading?'Joining…':'Join Waitlist'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Booking Modal ─────────────────────────────────────────────────────────────
function BookingModal({session,termsText,onClose}:{session:Session;termsText:string;onClose:()=>void}){
  const [step,setStep]=useState<'details'|'payment'|'done'>('details')
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [phone,setPhone]=useState('')
  const [qty,setQty]=useState(1); const [additionalNames,setAdditionalNames]=useState<string[]>([])
  const [termsAccepted,setTermsAccepted]=useState(false); const [showTerms,setShowTerms]=useState(false)
  const [loading,setLoading]=useState(false); const [error,setError]=useState('')
  const [clientSecret,setCs]=useState(''); const [bookingRef,setRef]=useState(''); const [expiresAt,setExpires]=useState('')
  const maxQty=Math.min(session.max_tickets_per_order??4,session.available)
  const total=session.price_pence*qty

  function updateQty(n:number){
    setQty(n)
    setAdditionalNames(prev=>{const a=[...prev];while(a.length<n-1)a.push('');return a.slice(0,n-1)})
  }

  async function handleContinue(){
    if(!termsAccepted){setError('Please accept the terms and conditions');return}
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({session_id:session.id,quantity:qty,name,email,phone,additional_attendees:additionalNames.filter(Boolean).map(n=>({name:n}))})})
      const d=await res.json()
      if(!res.ok){setError(d.error??'Could not reserve seat');return}
      setCs(d.clientSecret);setRef(d.bookingRef);setExpires(d.expiresAt);setStep('payment')
    }catch{setError('Network error — please try again')}
    finally{setLoading(false)}
  }

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose()}} role="dialog" aria-modal="true" aria-label="Book tickets">
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,width:'100%',maxWidth:480,padding:28,position:'relative',maxHeight:'92vh',overflowY:'auto'}}>
        <button onClick={onClose} style={{position:'absolute',top:16,right:16,background:'none',border:'none',color:T.muted,fontSize:22,cursor:'pointer'}} aria-label="Close checkout">✕</button>

        {step!=='done'&&(
          <div style={{marginBottom:20}}>
            {session.label&&<span style={{background:T.accentDim,color:T.accent,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${T.accentBorder}`,marginBottom:6,display:'inline-block'}}>{session.label} London</span>}
            <div style={{fontWeight:700,fontSize:18,color:T.accent}}>{session.title}</div>
            <div style={{display:'flex',gap:12,marginTop:6,flexWrap:'wrap' as const}}>
              <span style={{fontSize:13,color:T.muted}}>📅 {fmtDateLong(session.date)}</span>
              <span style={{fontSize:13,color:T.muted}}>🕐 {session.time}</span>
              <span style={{fontSize:13,color:T.muted}}>📍 {session.venue}</span>
            </div>
          </div>
        )}

        {step==='details'&&(
          <>
            {session.description&&<div style={{marginBottom:16,padding:'12px 14px',background:T.accentDim,border:`1px solid ${T.accentBorder}`,borderRadius:8,fontSize:13,color:'#a0c890',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{session.description}</div>}

            {[['Full Name *','text',name,setName,'Your name'],['Email *','email',email,setEmail,'you@email.com'],['Phone *','tel',phone,setPhone,'+44 7700 000000']].map(([l,t,v,sv,ph])=>(
              <div key={l as string} style={{marginBottom:14}}>
                <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5}}>{l as string}</label>
                <input type={t as string} value={v as string} onChange={e=>(sv as any)(e.target.value)} placeholder={ph as string} style={inp()}
                  onFocus={e=>(e.target.style.borderColor=T.accent)} onBlur={e=>(e.target.style.borderColor=T.border)}/>
              </div>
            ))}

            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:8}}>Number of Tickets</label>
              <div style={{display:'flex',gap:8}}>
                {Array.from({length:maxQty},(_,i)=>i+1).map(n=>(
                  <button key={n} onClick={()=>updateQty(n)} style={{flex:1,padding:'10px 0',borderRadius:8,cursor:'pointer',border:`1px solid ${qty===n?T.accent:T.border}`,background:qty===n?T.accentDim:T.card,color:qty===n?T.accent:T.text,fontWeight:700,fontSize:15,fontFamily:'inherit'}}>{n}</button>
                ))}
              </div>
            </div>

            {qty>1&&(
              <div style={{marginBottom:20,padding:'14px',background:'rgba(255,255,255,0.02)',border:`1px solid ${T.border}`,borderRadius:10}}>
                <div style={{fontSize:12,color:T.muted,marginBottom:10,fontWeight:600}}>Additional attendee names (required)</div>
                {Array.from({length:qty-1},(_,i)=>(
                  <div key={i} style={{marginBottom:10}}>
                    <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:4}}>Attendee {i+2} full name *</label>
                    <input value={additionalNames[i]??''} onChange={e=>{const a=[...additionalNames];a[i]=e.target.value;setAdditionalNames(a)}}
                      placeholder={`Full name of attendee ${i+2}`} style={inp()}
                      onFocus={e=>(e.target.style.borderColor=T.accent)} onBlur={e=>(e.target.style.borderColor=T.border)}/>
                  </div>
                ))}
              </div>
            )}

            <div style={{marginBottom:20,padding:'14px',background:'rgba(255,255,255,0.02)',border:`1px solid ${T.border}`,borderRadius:10}}>
              <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer'}}>
                <input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)} style={{marginTop:2,width:16,height:16,accentColor:T.accent}}/>
                <span style={{fontSize:13,color:T.muted,lineHeight:1.5}}>
                  I agree to the{' '}
                  <button onClick={e=>{e.preventDefault();setShowTerms(true)}} style={{background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,textDecoration:'underline',fontFamily:'inherit',padding:0}}>
                    Terms & Conditions
                  </button>
                </span>
              </label>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderTop:`1px solid ${T.border}`,marginBottom:16}}>
              <span style={{color:T.muted}}>Total</span>
              <span style={{fontWeight:700,fontSize:20,color:T.accent}}>{fmt(total)}</span>
            </div>
            {error&&<div style={{marginBottom:12,padding:'10px',background:T.dangerDim,color:T.danger,borderRadius:8,fontSize:13}}>{error}</div>}
            <button onClick={handleContinue} disabled={!name||!email||!phone||loading||(qty>1&&additionalNames.slice(0,qty-1).some(n=>!n))}
              style={{width:'100%',padding:'13px',borderRadius:10,border:'none',background:(!name||!email||!phone||loading)?T.border:T.accent,color:(!name||!email||!phone||loading)?T.muted:'#080f08',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>
              {loading?'Reserving your seat…':'Continue to Payment →'}
            </button>
          </>
        )}

        {step==='payment'&&clientSecret&&(
          <Elements stripe={stripePromise} options={{clientSecret,appearance:{theme:'night',variables:{colorPrimary:T.accent,colorBackground:T.card,colorText:T.text,borderRadius:'8px'}}}}>
            <CheckoutForm bookingRef={bookingRef} expiresAt={expiresAt} onSuccess={()=>setStep('done')}/>
          </Elements>
        )}

        {step==='done'&&(
          <div style={{textAlign:'center',padding:'10px 0'}}>
            <div style={{fontSize:52,marginBottom:12}}>🏸</div>
            <div style={{fontSize:26,fontWeight:700,color:T.accent,marginBottom:8}}>You're in!</div>
            <p style={{color:T.muted,fontSize:14,marginBottom:8}}>Confirmation sent to <strong style={{color:T.text}}>{email}</strong></p>
            <p style={{color:T.muted,fontSize:14,marginBottom:20}}>Booking ref: <strong style={{color:T.accent}}>{bookingRef}</strong></p>
            <button onClick={onClose} style={{padding:'12px 28px',background:T.accent,color:'#080f08',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>Done</button>
          </div>
        )}

        {showTerms&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} role="dialog" aria-modal="true">
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,width:'100%',maxWidth:520,padding:28,maxHeight:'80vh',overflowY:'auto'}}>
              <div style={{fontWeight:700,fontSize:18,color:T.accent,marginBottom:16}}>Terms & Conditions</div>
              <pre style={{whiteSpace:'pre-wrap',fontSize:13,color:T.muted,lineHeight:1.7,fontFamily:'inherit'}}>{termsText}</pre>
              <button onClick={()=>{setShowTerms(false);setTermsAccepted(true)}} style={{marginTop:20,width:'100%',padding:'12px',background:T.accent,color:'#080f08',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>
                Accept & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({session,onSelect,onWaitlist,onUnlocked}:{session:Session;onSelect:()=>void;onWaitlist:()=>void;onUnlocked?:()=>void}){
  const [expanded,setExpanded]=useState(false)
  const isComingSoon=session.status==='coming_soon'
  const pct=Math.round(((session.booked+session.held)/session.capacity)*100)
  const soldOut=session.available<=0&&!isComingSoon
  const hot=session.available<=4&&!soldOut&&!isComingSoon
  const spotsLeft=session.available

  return(
    <article style={{background:T.card,border:`1px solid ${isComingSoon?'rgba(96,180,255,0.25)':hot?T.accent:T.border}`,borderRadius:12,overflow:'hidden',transition:'transform 0.15s,box-shadow 0.15s'}}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 32px rgba(111,207,64,0.08)'}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='none'}}>

      <div style={{padding:'15px 17px',background:session.image_url?'none':'linear-gradient(135deg,#1a3a1a 0%,#0a1a0a 100%)'}}>
        {/* Badges row */}
        <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap' as const}}>
          {session.label&&<span style={{background:isComingSoon?T.infoDim:T.accentDim,color:isComingSoon?T.info:T.accent,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${isComingSoon?'rgba(96,180,255,0.25)':T.accentBorder}`}}>{session.label.toUpperCase()} LONDON</span>}
          {isComingSoon&&<span style={{background:T.infoDim,color:T.info,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:'1px solid rgba(96,180,255,0.35)'}}>COMING SOON</span>}
          {hot&&!soldOut&&<span style={{background:'rgba(224,144,64,0.15)',color:T.warning,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:'1px solid rgba(224,144,64,0.4)'}}>🔥 SELLING FAST</span>}
          {soldOut&&<span style={{background:T.dangerDim,color:T.danger,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:'1px solid rgba(224,85,85,0.4)'}}>SOLD OUT</span>}
        </div>

        <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>
          {/* Date block */}
          <div style={{background:isComingSoon?T.infoDim:T.accentDim,border:`1px solid ${isComingSoon?'rgba(96,180,255,0.25)':T.accentBorder}`,borderRadius:10,padding:'10px 12px',minWidth:52,textAlign:'center',flexShrink:0}}>
            <div style={{fontSize:26,fontWeight:900,color:isComingSoon?T.info:T.accent,lineHeight:1}}>{getDayNum(session.date)}</div>
            <div style={{fontSize:11,color:T.muted}}>{getMonth(session.date)}</div>
          </div>

          <div style={{flex:1,minWidth:0}}>
            <h2 style={{fontWeight:700,fontSize:17,marginBottom:6,color:T.text,margin:'0 0 6px'}}>{session.title}</h2>

            {/* Event meta — date, time, location like Ticket Tailor */}
            <div style={{display:'flex',flexDirection:'column' as const,gap:4,marginBottom:10}}>
              <span style={{fontSize:13,color:T.muted}}>📅 {fmtDateLong(session.date)}, {session.time}</span>
              <span style={{fontSize:13,color:T.muted}}>📍 {session.venue}, London</span>
            </div>

            {session.description&&(
              <div style={{marginBottom:10}}>
                <p style={{fontSize:12,color:'#7a9a7a',lineHeight:1.5,margin:0,whiteSpace:'pre-wrap'}}>
                  {expanded||session.description.length<=120 ? session.description : session.description.slice(0,120)+'…'}
                </p>
                {session.description.length>120&&(
                  <button onClick={()=>setExpanded(!expanded)} style={{background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:12,padding:0,fontFamily:'inherit',marginTop:4}}>
                    {expanded?'Show less ↑':'Read more + map ↓'}
                  </button>
                )}
              </div>
            )}

            {/* Spots remaining bar */}
            <div style={{marginBottom:12}}>
              <div style={{height:5,background:T.border,borderRadius:3,marginBottom:5}}>
                <div style={{height:'100%',width:`${pct}%`,background:pct>=90?T.danger:pct>=70?T.warning:T.accent,borderRadius:3,transition:'width 0.5s'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                <span style={{color:soldOut?T.danger:hot?T.warning:T.muted}}>
                  {soldOut?'🔴 Sold out':hot?`🟠 Only ${spotsLeft} spot${spotsLeft===1?'':'s'} remaining`:`🟢 ${spotsLeft} of ${session.capacity} spots remaining`}
                </span>
                <span style={{color:T.accent,fontWeight:600}}>{fmt(session.price_pence)} / person</span>
              </div>
              {session.max_tickets_per_order&&!soldOut&&<div style={{fontSize:11,color:T.muted,marginTop:3}}>Max {session.max_tickets_per_order} per order</div>}
            </div>

            {/* CTA buttons */}
            <div style={{display:'flex',gap:8}}>
              {isComingSoon?(
                <div style={{flex:1,padding:'11px 14px',background:T.infoDim,color:T.info,border:`1px solid rgba(96,180,255,0.25)`,borderRadius:9,fontWeight:600,fontSize:13,display:'flex',alignItems:'center',gap:6,userSelect:'none' as const}}>
                  ⏰ <ComingSoonCountdown opensAt={session.opens_at!} onUnlocked={onUnlocked??(() =>{})}/>
                </div>
              ):!soldOut?(
                <button onClick={()=>{fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:session.id,event:'book_now_click'})}).catch(()=>{});onSelect()}} style={{flex:1,padding:'11px',background:T.accent,color:'#080f08',border:'none',borderRadius:9,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
                  Book Now →
                </button>
              ):(
                <button onClick={onWaitlist} style={{flex:1,padding:'11px',background:T.infoDim,color:T.info,border:`1px solid rgba(96,180,255,0.25)`,borderRadius:9,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
                  🎯 Join Waitlist
                </button>
              )}
            </div>

            {/* Share buttons */}
            <ShareButtons session={session}/>
          </div>
        </div>

        {/* Venue map — expandable */}
        {expanded&&<VenueMap venue={session.venue} maps_url={session.maps_url}/>}
      </div>
    </article>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TicketsPage() {
  const [sessions,setSessions]=useState<Session[]>([])
  const [settings,setSettings]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(true)
  const [selected,setSelected]=useState<Session|null>(null)
  const [waitlistSession,setWaitlistSession]=useState<Session|null>(null)

  const sessionsHashRef=useRef('')
  const fetchSessions=useCallback(async()=>{
    const res=await fetch('/api/sessions')
    const d=await res.json()
    // Only re-render if data actually changed — prevents page jitter on 15s auto-refresh
    const hash=JSON.stringify(d.sessions)
    if(hash!==sessionsHashRef.current){sessionsHashRef.current=hash;setSessions(d.sessions??[])}
    if(d.settings)setSettings(d.settings)
    setLoading(false)
  },[])

  useEffect(()=>{
    fetchSessions()
    const i=setInterval(fetchSessions,15000)
    return()=>clearInterval(i)
  },[fetchSessions])

  const open=sessions.filter(s=>s.status==='open')
  const comingSoon=sessions.filter(s=>s.status==='coming_soon')

  return(
    <>
      {/* Schema.org for all open sessions — helps Google index your events */}
      {open.map(s=><SessionSchema key={s.id} session={s}/>)}

      {/* Accessibility: skip to main content */}
      <a href="#main-content" style={{position:'absolute',left:'-9999px',top:'auto',width:1,height:1,overflow:'hidden'}} onFocus={e=>(e.currentTarget.style.left='0')}>
        Skip to main content
      </a>

      <div style={{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:"system-ui,sans-serif"}}>

        {/* Header with logo + social links */}
        <header style={{borderBottom:`1px solid ${T.border}`,padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',background:T.bg,position:'sticky',top:0,zIndex:50}}>
          <a href="/tickets" style={{display:'flex',alignItems:'center',gap:14,textDecoration:'none'}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:'#1a3a1a',border:`2px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
              <img src="/logo.jpg" alt="The Shuttle Social" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{(e.target as HTMLImageElement).style.display='none';(e.target as HTMLImageElement).parentElement!.textContent='🏸'}}/>
            </div>
            <div>
              <div style={{fontWeight:900,fontSize:18,color:T.accent,lineHeight:1,letterSpacing:0.5}}>The Shuttle Social</div>
              <div style={{fontSize:10,color:T.muted,letterSpacing:2,marginTop:1}}>BADMINTON FOR EVERYONE</div>
            </div>
          </a>

          {/* Social links */}
          <nav aria-label="Social media" style={{display:'flex',gap:10,alignItems:'center'}}>
            {([
              {href:'https://instagram.com/theshuttlesocial',label:'Instagram',platform:'instagram' as const,bg:'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)'},
              {href:'https://tiktok.com/@theshuttlesocial',label:'TikTok',platform:'tiktok' as const,bg:'#010101'},
            ] as const).map(s=>(
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}
                style={{width:34,height:34,borderRadius:'50%',background:s.bg,display:'flex',alignItems:'center',justifyContent:'center',textDecoration:'none'}}>
                <SocialIcon platform={s.platform} size={20}/>
              </a>
            ))}
          </nav>
        </header>

        <main id="main-content" style={{maxWidth:640,margin:'0 auto',padding:'28px 20px 60px'}}>
          <h1 style={{fontSize:'clamp(32px,7vw,52px)',fontWeight:900,lineHeight:0.95,marginBottom:16,color:T.text}}>
            BOOK YOUR<br/><span style={{color:T.accent}}>NEXT SESSION</span>
          </h1>

          {settings.about_text&&(
            <div style={{marginBottom:28,padding:'16px 18px',background:T.card,border:`1px solid ${T.border}`,borderRadius:12,fontSize:14,color:'#a0c090',lineHeight:1.7,borderLeft:`3px solid ${T.accent}`,whiteSpace:'pre-wrap'}}>
              {settings.about_text}
            </div>
          )}

          {loading?(
            <div style={{color:T.muted,textAlign:'center',padding:60}}>
              <div style={{fontSize:32,marginBottom:12,animation:'spin 1s linear infinite'}}>⏳</div>
              Loading sessions…
            </div>
          ):(
            <>
              {open.length>0&&(
                <section aria-label="Open for booking">
                  <div style={{fontSize:11,color:T.muted,letterSpacing:3,marginBottom:12,textTransform:'uppercase'}}>Open for booking</div>
                  <div style={{display:'flex',flexDirection:'column',gap:16,marginBottom:32}}>
                    {open.map(s=><SessionCard key={s.id} session={s} onSelect={()=>setSelected(s)} onWaitlist={()=>setWaitlistSession(s)}/>)}
                  </div>
                </section>
              )}
              {comingSoon.length>0&&(
                <section aria-label="Coming soon" style={{marginBottom:32}}>
                  <div style={{fontSize:11,color:T.muted,letterSpacing:3,marginBottom:12,textTransform:'uppercase'}}>Coming soon</div>
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    {comingSoon.map(s=><SessionCard key={s.id} session={s} onSelect={()=>{}} onWaitlist={()=>{}} onUnlocked={fetchSessions}/>)}
                  </div>
                </section>
              )}
              {open.length===0&&comingSoon.length===0&&(
                <div style={{textAlign:'center',padding:80,color:T.muted}}>
                  <div style={{fontSize:48,marginBottom:16}}>🏸</div>
                  <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>No sessions open right now</div>
                  <div style={{fontSize:14}}>Follow us on <a href="https://instagram.com/theshuttlesocial" target="_blank" rel="noopener" style={{color:T.accent}}>Instagram</a> or <a href="https://tiktok.com/@theshuttlesocial" target="_blank" rel="noopener" style={{color:T.accent}}>TikTok</a> for updates</div>
                </div>
              )}
            </>
          )}
        </main>

        <footer style={{borderTop:`1px solid ${T.border}`,padding:'24px 20px'}}>
          <div style={{maxWidth:640,margin:'0 auto',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap' as const,gap:12}}>
            <div style={{fontSize:12,color:T.muted}}>
              The Shuttle Social · <a href="https://instagram.com/theshuttlesocial" target="_blank" rel="noopener" style={{color:T.accent,textDecoration:'none'}}>@theshuttlesocial</a> · <a href="https://tiktok.com/@theshuttlesocial" target="_blank" rel="noopener" style={{color:T.accent,textDecoration:'none'}}>TikTok</a>
            </div>
          </div>
          {/* Back to top — like Ticket Tailor */}
          <div style={{maxWidth:640,margin:'12px auto 0',textAlign:'right'}}>
            <a href="#main-content" style={{fontSize:12,color:T.muted,textDecoration:'none'}} onClick={e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'})}}>
              Back to top ↑
            </a>
          </div>
        </footer>
      </div>

      {selected&&<BookingModal session={selected} termsText={settings.terms_and_conditions??''} onClose={()=>{setSelected(null);fetchSessions()}}/>}
      {waitlistSession&&<WaitlistModal session={waitlistSession} onClose={()=>{setWaitlistSession(null);fetchSessions()}}/>}
    </>
  )
}
