'use client'
import { useEffect, useState, useCallback, useRef, useMemo, Component } from 'react'
import type { ReactNode } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { ThemeToggle } from '@/app/_design/ThemeToggle'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// Styling lives in app/_design/tss.css (shared V5 design system) and ./tickets.css.

interface Session {
  id:string; title:string; label?:string; venue:string; region:string
  date:string; time:string; price_pence:number
  status:string; availability:'available'|'limited'|'sold_out'; spotsRemaining?:number
  description?:string; waitlist_count?:number; opens_at?:string; image_url?:string; max_tickets_per_order?:number; maps_url?:string
}

const fmt = (p:number) => `£${(p/100).toFixed(2)}`
const fmtDateLong = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
const fmtDateShort = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})
const getDayNum = (d:string) => new Date(d).getDate()
const getMonth = (d:string) => new Date(d).toLocaleString('en-GB',{month:'short'})
const getWeekday = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long'})

const INSTAGRAM = 'https://instagram.com/theshuttlesocial'
const TIKTOK = 'https://tiktok.com/@theshuttlesocial'

function Arrow() {
  return (
    <span className="book-arrow" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9F46B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </span>
  )
}

// ── Error Boundary — catches React render crashes in booking flow ─────────────
class ErrorBoundary extends Component<{children:ReactNode;fallback?:ReactNode},{hasError:boolean}> {
  constructor(props:any){super(props);this.state={hasError:false}}
  static getDerivedStateFromError(){return{hasError:true}}
  componentDidCatch(err:Error){console.error('[ErrorBoundary]',err)}
  render(){
    if(this.state.hasError) return this.props.fallback??(
      <div className="t-overlay" role="alertdialog" aria-modal="true" aria-label="Something went wrong">
        <div className="t-modal t-done">
          <div className="t-modal-title">Something went wrong</div>
          <p className="muted small">Please refresh and try again. If you completed payment, check your email for a confirmation.</p>
          <button onClick={()=>this.setState({hasError:false})} className="t-btn t-btn-ink">Try again</button>
        </div>
      </div>
    )
    return this.props.children
  }
}

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
      "availability": session.availability !== 'sold_out' ? "https://schema.org/InStock" : "https://schema.org/SoldOut" }
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(schema)}}/>
}

// ── Social media SVG icons ────────────────────────────────────────────────────
function SocialIcon({ platform, size=18 }: { platform:'whatsapp'|'instagram'|'tiktok'; size?:number }) {
  if (platform==='whatsapp') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
  if (platform==='instagram') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white" aria-hidden="true">
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
    { platform:'whatsapp' as const, href:`https://wa.me/?text=${text}${urlEnc}`, aria:'Share on WhatsApp', bg:'#25d366' },
    { platform:'instagram' as const, href:INSTAGRAM, aria:'Instagram', bg:'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' },
    { platform:'tiktok' as const, href:TIKTOK, aria:'TikTok', bg:'#010101' },
  ]

  return (
    <div className="t-share">
      <span>Share</span>
      {links.map(l=>(
        <a key={l.aria} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.aria} style={{background:l.bg}}>
          <SocialIcon platform={l.platform} size={15}/>
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
    <div className="t-map">
      <iframe
        title={`Map of ${venue}`}
        src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}`}
        allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade"
      />
      <a href={openUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps →</a>
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
  return <span className="t-timer">Opens in {h > 0 ? `${h}h ` : ''}{m}m {String(s).padStart(2,'0')}s</span>
}

// ── Checkout Form (payment step — rendered inside Elements provider) ──────────
function CheckoutForm({ bookingRef, expiresAt, onSuccess }:{bookingRef:string;expiresAt:string;onSuccess:()=>void}) {
  const stripe=useStripe(); const elements=useElements()
  const [paying,setPaying]=useState(false); const [error,setError]=useState(''); const [overtime,setOvertime]=useState(false)
  const [stripeReady,setStripeReady]=useState(false)
  const [secs,setSecs]=useState(()=>Math.max(0,Math.floor((new Date(expiresAt).getTime()-Date.now())/1000)))
  // Track mount state so we never setState after unmount (user closes modal mid-payment)
  const mountedRef=useRef(true)
  useEffect(()=>{return()=>{mountedRef.current=false}},[])
  useEffect(()=>{const t=setInterval(()=>setSecs(s=>Math.max(0,s-1)),1000);return()=>clearInterval(t)},[])
  const mm=String(Math.floor(secs/60)).padStart(2,'0'), ss=String(secs%60).padStart(2,'0')

  async function pay(){
    if(!stripe||!elements)return
    // Guard: PaymentElement must be mounted and ready before we can confirm
    const paymentElement=elements.getElement(PaymentElement)
    if(!paymentElement){
      console.warn('[CheckoutForm] PaymentElement not ready — aborting confirmPayment')
      return
    }
    if(mountedRef.current){setPaying(true);setError('');setOvertime(false)}

    // 45-second "still waiting" banner — useful for Apple Pay / bank 3DS flows
    const overtimeTimer=setTimeout(()=>{if(mountedRef.current)setOvertime(true)},45000)

    // 30-second hard timeout — prevents the button staying stuck forever
    const timeoutPromise=new Promise<{error:{message:string}}>((resolve)=>
      setTimeout(()=>resolve({error:{message:'Payment is taking longer than expected. Please check your email — if you completed Apple Pay your booking may already be confirmed. Otherwise tap Confirm & Pay again.'}}),30000)
    )

    try{
      const result=await Promise.race([
        stripe.confirmPayment({elements,confirmParams:{return_url:`${window.location.origin}/tickets/success?ref=${bookingRef}`},redirect:'if_required'}),
        timeoutPromise,
      ])
      clearTimeout(overtimeTimer)
      if(!mountedRef.current)return // modal was closed — don't touch state

      if(result.error){
        // Detect Apple Pay / Google Pay sheet dismissed without payment
        // Stripe returns type=validation_error or code=payment_intent_authentication_failure
        const e=result.error as any
        const isDismissed=(e.type==='validation_error')||
          (e.code==='payment_intent_authentication_failure')||
          (e.message?.toLowerCase().includes('cancel'))||
          (e.message?.toLowerCase().includes('dismiss'))
        if(isDismissed){
          // Silent reset — wallet was just cancelled, no scary error message
          setError('')
        }else{
          setError(e.message??'Payment failed. Please try again.')
        }
      }else{
        onSuccess()
      }
    }catch(err:any){
      clearTimeout(overtimeTimer)
      if(!mountedRef.current)return
      setError(err?.message??'Payment failed. Please try again.')
    }finally{
      if(mountedRef.current)setPaying(false)
    }
  }

  return(
    <div>
      {/* Calm seat-saved banner — only turns red in final 20 seconds */}
      <div className={'t-note t-saved'+(secs<20?' danger':'')} role="status">
        <span>Your spot is saved. Complete payment below.</span>
        <span className="t-timer" aria-label={`${mm} minutes ${ss} seconds left`}>{mm}:{ss}</span>
      </div>
      {/* Accordion layout puts Apple Pay / Google Pay / Link at the top */}
      <PaymentElement options={{layout:'accordion'}} onReady={()=>setStripeReady(true)}/>
      {/* Loading state — shown until Stripe's iframe signals it's interactive */}
      {!stripeReady&&<div className="t-note plain" style={{marginTop:'0.75rem',textAlign:'center'}}>Loading payment form…</div>}
      {/* Overtime message — shown after 45s if still processing */}
      {overtime&&paying&&(
        <div className="t-note info" style={{marginTop:'0.75rem'}}>
          Still processing… If you completed Apple Pay or your bank check, please look in your email before retrying. Your booking may already be confirmed.
        </div>
      )}
      {error&&<div className="t-note danger" role="alert" style={{marginTop:'0.75rem'}}>{error}</div>}
      <button onClick={pay} disabled={paying||!stripe||!stripeReady} className="book t-wide" style={{marginTop:'1rem'}}>
        {paying?'Processing…':!stripeReady?'Loading payment form…':'Confirm & pay'}
        <Arrow/>
      </button>
    </div>
  )
}

// ── Waitlist Modal ────────────────────────────────────────────────────────────
function WaitlistModal({session,otherSessions,onClose}:{session:Session;otherSessions:Session[];onClose:()=>void}){
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [phone,setPhone]=useState('')
  const [loading,setLoading]=useState(false); const [done,setDone]=useState<number|null>(null); const [error,setError]=useState('')
  const [spacesNeeded,setSpacesNeeded]=useState(1)
  const [minSpaces,setMinSpaces]=useState(1)
  // Extra sessions to also waitlist for, in the order the user picks them (= preference order after this one).
  const [extraIds,setExtraIds]=useState<string[]>([])

  function setSpaces(n:number){ setSpacesNeeded(n); setMinSpaces(n) } // default fewest-acceptable to the full group
  function toggleExtra(id:string){ setExtraIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]) }

  async function join(){
    setLoading(true);setError('')
    const session_ids=[session.id,...extraIds]
    const res=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_ids,name,email,phone,spaces_needed:spacesNeeded,min_spaces_acceptable:minSpaces})})
    const d=await res.json()
    if(!res.ok){setError(d.error??'Failed');setLoading(false);return}
    setDone(d.position);setLoading(false)
  }
  return(
    <div className="t-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}} role="dialog" aria-modal="true" aria-label="Join the waitlist">
      <div className="t-modal">
        <button onClick={onClose} className="t-close" aria-label="Close">✕</button>
        {done?(
          <div className="t-done">
            <span className="kicker muted">Your place</span>
            <div className="num">#{done}</div>
            <div className="t-modal-title">You’re on the waitlist</div>
            <p className="muted small">We’ll message you the moment a spot opens up{extraIds.length?' for any of your chosen sessions':''}. Keep an eye on your email.</p>
            <button onClick={onClose} className="t-btn t-btn-ink">Done</button>
          </div>
        ):(
          <>
            <div className="t-modal-h">
              <span className="kicker muted">Sold out</span>
              <div className="t-modal-title">Join the waitlist</div>
              <div className="muted small">{session.title} · {fmtDateShort(session.date)}</div>
            </div>
            {[['Full name','text',name,setName,'Your name','name'],['Email','email',email,setEmail,'you@email.com','email'],['Phone','tel',phone,setPhone,'+44 7700 000000','tel']].map(([l,t,v,sv,ph,ac])=>(
              <div key={l as string} className="t-field-row">
                <label className="t-label" htmlFor={`wl-${ac}`}>{l as string} *</label>
                <input id={`wl-${ac}`} className="t-input" type={t as string} value={v as string} onChange={e=>(sv as any)(e.target.value)} placeholder={ph as string} autoComplete={ac as string} required/>
              </div>
            ))}

            {/* How many spaces */}
            <div className="t-field-row">
              <span className="t-label" id="wl-spaces">How many spaces do you need?</span>
              <div className="t-choices" role="group" aria-labelledby="wl-spaces">
                {[1,2,3,4].map(n=>(
                  <button key={n} onClick={()=>setSpaces(n)} className="t-choice" aria-pressed={spacesNeeded===n}>{n}</button>
                ))}
              </div>
            </div>

            {/* Fewest acceptable */}
            {spacesNeeded>1&&(
              <div className="t-field-row">
                <span className="t-label" id="wl-min">What’s the fewest you’d take?</span>
                <div className="t-choices" role="group" aria-labelledby="wl-min">
                  {Array.from({length:spacesNeeded},(_,i)=>i+1).map(n=>(
                    <button key={n} onClick={()=>setMinSpaces(n)} className="t-choice" aria-pressed={minSpaces===n}>{n}</button>
                  ))}
                </div>
                <div className="t-hint">Set this lower if you’d still come with a smaller group.</div>
              </div>
            )}

            {/* Also waitlist for other sessions, ranked by pick order */}
            {otherSessions.length>0&&(
              <div className="t-field-row" style={{marginBottom:'1rem'}}>
                <span className="t-label">Also waitlist me for (we’ll offer your top choice first):</span>
                <div style={{display:'flex',flexDirection:'column',gap:'0.375rem'}}>
                  {otherSessions.map(s=>{
                    const idx=extraIds.indexOf(s.id)
                    const checked=idx>=0
                    return(
                      <button key={s.id} onClick={()=>toggleExtra(s.id)} className="t-option" aria-pressed={checked}>
                        <span className="t-option-n">{checked?idx+2:''}</span>
                        <span className="small" style={{flex:1}}>{s.title}<span className="muted"> · {fmtDateShort(s.date)}</span></span>
                      </button>
                    )
                  })}
                </div>
                {extraIds.length>0&&<div className="t-hint">Numbers show the order we’ll offer spots. This session is your first choice.</div>}
              </div>
            )}

            {error&&<div className="t-note danger" role="alert">{error}</div>}
            <button onClick={join} disabled={!name||!email||!phone||loading} className="book t-wide">
              {loading?'Joining…':'Join the waitlist'}
              <Arrow/>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Stable Elements wrapper — memoises options so the Stripe iframe never remounts ─
function ElementsWithStableOptions({clientSecret,bookingRef,expiresAt,onSuccess}:{clientSecret:string;bookingRef:string;expiresAt:string;onSuccess:()=>void}){
  // options object is stable: clientSecret is set once and never changes after mount.
  // The payment form matches the page's light or dark theme at the moment it opens.
  const options=useMemo(()=>{
    const set=document.documentElement.dataset.theme
    const dark=set?set==='dark':matchMedia('(prefers-color-scheme: dark)').matches
    return {
      clientSecret,
      fonts:[{cssSrc:'https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700&display=swap'}],
      appearance:{
        theme:(dark?'night':'stripe') as 'night'|'stripe',
        variables:{
          colorPrimary:dark?'#D9F46B':'#1E6B3E', colorBackground:dark?'#0C1D14':'#FFFFFF',
          colorText:dark?'#EEF3E6':'#0F2A1A', colorDanger:dark?'#F28B82':'#B42318',
          fontFamily:'Urbanist, system-ui, sans-serif', fontSizeBase:'16px', borderRadius:'14px',
        },
      },
    }
  },[clientSecret])
  return(
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm bookingRef={bookingRef} expiresAt={expiresAt} onSuccess={onSuccess}/>
    </Elements>
  )
}

// ── Booking Modal ─────────────────────────────────────────────────────────────
function BookingModal({session,termsText,onClose}:{session:Session;termsText:string;onClose:()=>void}){
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [phone,setPhone]=useState('')
  const [qty,setQty]=useState(1); const [additionalNames,setAdditionalNames]=useState<string[]>([])
  const [termsAccepted,setTermsAccepted]=useState(false); const [showTerms,setShowTerms]=useState(false)
  const [loading,setLoading]=useState(false); const [error,setError]=useState('')
  const [clientSecret,setCs]=useState(''); const [bookingRef,setRef]=useState(''); const [expiresAt,setExpires]=useState('')
  const [done,setDone]=useState(false); const [hasSavedUser,setHasSavedUser]=useState(false)
  const [creditAvailable,setCreditAvailable]=useState(0); const [applyCredit,setApplyCredit]=useState(true)

  const maxQty=session.availability==='limited'
    ?Math.min(session.max_tickets_per_order??4,session.spotsRemaining??1)
    :session.max_tickets_per_order??4
  const total=session.price_pence*qty
  const creditApplied=applyCredit?Math.min(creditAvailable,total):0
  const duePence=total-creditApplied

  // Look up available credit once a plausible email is entered.
  useEffect(()=>{
    if(clientSecret)return
    const e=email.trim()
    if(!e||!e.includes('@')){setCreditAvailable(0);return}
    const t=setTimeout(()=>{
      fetch(`/api/credits?email=${encodeURIComponent(e)}`).then(r=>r.json()).then(d=>setCreditAvailable(d.availablePence??0)).catch(()=>{})
    },400)
    return()=>clearTimeout(t)
  },[email,clientSecret])

  // Pre-fill details from localStorage for returning customers
  useEffect(()=>{
    try{
      const saved=localStorage.getItem('tss_user')
      if(saved){const u=JSON.parse(saved);if(u.name)setName(u.name);if(u.email)setEmail(u.email);if(u.phone)setPhone(u.phone);setHasSavedUser(true)}
    }catch{}
  },[])

  function clearSaved(){try{localStorage.removeItem('tss_user')}catch{};setName('');setEmail('');setPhone('');setHasSavedUser(false)}

  function updateQty(n:number){
    setQty(n)
    setAdditionalNames(prev=>{const a=[...prev];while(a.length<n-1)a.push('');return a.slice(0,n-1)})
  }

  const formComplete=!!(name&&email&&phone&&termsAccepted&&!clientSecret&&(qty===1||additionalNames.slice(0,qty-1).every(n=>n)))

  async function reserveSeat(){
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({session_id:session.id,quantity:qty,name,email,phone,apply_credit:applyCredit&&creditAvailable>0,additional_attendees:additionalNames.filter(Boolean).map(n=>({name:n}))})})
      const d=await res.json()
      if(!res.ok){setError(d.error??'Could not reserve seat');return}
      try{localStorage.setItem('tss_user',JSON.stringify({name,email,phone}))}catch{}
      // Credit covered the whole order — no payment needed.
      if(d.fullyCovered){setRef(d.bookingRef);setDone(true);return}
      setCs(d.clientSecret);setRef(d.bookingRef);setExpires(d.expiresAt)
    }catch{setError('Network error — please try again')}
    finally{setLoading(false)}
  }

  // ── Done screen
  if(done) return(
    <div className="t-overlay" role="dialog" aria-modal="true" aria-label="Booking confirmed">
      <div className="t-modal t-done">
        <div className="t-done-mark" aria-hidden="true">✓</div>
        <div className="t-modal-title">You’re in!</div>
        <p className="muted small">Confirmation sent to <strong style={{color:'var(--ink)'}}>{email}</strong></p>
        <p className="muted small">Booking ref <strong style={{color:'var(--accent)'}}>{bookingRef}</strong></p>
        <button onClick={onClose} className="t-btn t-btn-ink">Done</button>
      </div>
    </div>
  )

  return(
    <div className="t-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}} role="dialog" aria-modal="true" aria-label="Book tickets">
      <div className="t-modal">
        <button onClick={onClose} className="t-close" aria-label="Close checkout">✕</button>

        {/* Session header */}
        <div className="t-modal-h">
          {session.label&&<span className="t-tag" style={{alignSelf:'flex-start'}}>{session.label} London</span>}
          <div className="t-modal-title">{session.title}</div>
          <div className="t-meta">
            <span>{fmtDateLong(session.date)} · {session.time}</span>
            <span>{session.venue}</span>
          </div>
        </div>

        {/* Description — only shown before seat is reserved */}
        {!clientSecret&&session.description&&<div className="t-note plain t-desc-box">{session.description}</div>}

        {/* Form fields — locked (read-only overlay) once seat is reserved */}
        <div style={{opacity:clientSecret?0.55:1,pointerEvents:clientSecret?'none':'auto',transition:'opacity 0.3s'}}>

          {/* Returning customer banner */}
          {hasSavedUser&&!clientSecret&&(
            <div className="t-note t-saved">
              <span>Welcome back, {name.split(' ')[0]}!</span>
              <button onClick={clearSaved} className="t-link" style={{color:'var(--muted)'}}>Not you? Clear</button>
            </div>
          )}

          <div className="t-field-row">
            <label className="t-label" htmlFor="bk-name">Full name *</label>
            <input id="bk-name" className="t-input" type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" autoComplete="name" required/>
          </div>
          <div className="t-field-row">
            <label className="t-label" htmlFor="bk-email">Email *</label>
            <input id="bk-email" className="t-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" required/>
          </div>
          <div className="t-field-row">
            <label className="t-label" htmlFor="bk-phone">Phone *</label>
            <input id="bk-phone" className="t-input" type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+44 7700 000000" autoComplete="tel" required/>
          </div>

          {/* Quantity */}
          <div className="t-field-row" style={{marginBottom:'1.25rem'}}>
            <span className="t-label" id="bk-qty">Number of tickets</span>
            <div className="t-choices" role="group" aria-labelledby="bk-qty">
              {Array.from({length:maxQty},(_,i)=>i+1).map(n=>(
                <button key={n} onClick={()=>updateQty(n)} className="t-choice" aria-pressed={qty===n}>{n}</button>
              ))}
            </div>
          </div>

          {/* Additional attendees */}
          {qty>1&&(
            <div className="t-box">
              <div className="t-label">Other attendees’ names (required)</div>
              {Array.from({length:qty-1},(_,i)=>(
                <div key={i} className="t-field-row">
                  <label className="t-label" htmlFor={`bk-att-${i}`} style={{fontWeight:600}}>Attendee {i+2} full name *</label>
                  <input id={`bk-att-${i}`} className="t-input" value={additionalNames[i]??''} onChange={e=>{const a=[...additionalNames];a[i]=e.target.value;setAdditionalNames(a)}}
                    placeholder={`Full name of attendee ${i+2}`} autoComplete="off"/>
                </div>
              ))}
            </div>
          )}

          {/* Terms */}
          <div className="t-box">
            <label className="t-check">
              <input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}/>
              <span>
                I agree to the{' '}
                <button onClick={e=>{e.preventDefault();setShowTerms(true)}} className="t-link">Terms &amp; Conditions</button>
              </span>
            </label>
          </div>
        </div>

        {/* Available credit — apply toggle */}
        {!clientSecret&&creditAvailable>0&&(
          <div className="t-note">
            <label className="t-check" style={{color:'var(--accent)'}}>
              <input type="checkbox" checked={applyCredit} onChange={e=>setApplyCredit(e.target.checked)}/>
              <span>You have {fmt(creditAvailable)} credit. Apply it?</span>
            </label>
          </div>
        )}

        {/* Dynamic price total — live update as quantity/credit changes */}
        <div className="t-total">
          <div className="t-total-row">
            <span>{qty} × {fmt(session.price_pence)}</span>
            {creditApplied>0
              ?<span className="t-strike">{fmt(total)}</span>
              :<span className="num">{fmt(total)}</span>}
          </div>
          {creditApplied>0&&(
            <>
              <div className="t-total-row">
                <span>Credit applied</span>
                <span style={{color:'var(--accent)',fontWeight:700}}>−{fmt(creditApplied)}</span>
              </div>
              <div className="t-total-row" style={{paddingTop:'0.5rem',borderTop:'1px solid var(--line)'}}>
                <strong>{duePence<=0?'Nothing to pay':'To pay'}</strong>
                <span className="num">{fmt(duePence)}</span>
              </div>
            </>
          )}
        </div>

        {error&&<div className="t-note danger" role="alert">{error}</div>}

        {/* Reserve button — visible only before seat is held */}
        {!clientSecret&&(
          <button onClick={reserveSeat} disabled={!formComplete||loading} className="book t-wide">
            {loading?'Reserving your spot…':duePence<=0?'Confirm booking':'Continue to payment'}
            <Arrow/>
          </button>
        )}

        {/* Payment section — memoised options so Elements never remounts mid-flow */}
        {clientSecret&&(
          <ElementsWithStableOptions clientSecret={clientSecret} bookingRef={bookingRef} expiresAt={expiresAt} onSuccess={()=>setDone(true)}/>
        )}

        {/* Terms overlay */}
        {showTerms&&(
          <div className="t-overlay top" role="dialog" aria-modal="true" aria-label="Terms and conditions">
            <div className="t-modal wide">
              <div className="t-modal-title" style={{marginBottom:'1rem'}}>Terms &amp; Conditions</div>
              <pre className="t-terms">{termsText}</pre>
              <button onClick={()=>{setShowTerms(false);setTermsAccepted(true)}} className="t-btn t-btn-ink t-btn-block" style={{marginTop:'1.25rem'}}>
                Accept &amp; close
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
  const soldOut=session.availability==='sold_out'
  const hot=session.availability==='limited'
  const spotsLeft=session.spotsRemaining

  return(
    <article className={'t-card'+(isComingSoon?' is-soon':hot&&!soldOut?' is-hot':'')}>
      <div className="t-card-top">
        <div className="t-date">
          <span className="kicker muted">{getWeekday(session.date)}</span>
          <span className="disp">{getDayNum(session.date)} {getMonth(session.date)}</span>
        </div>
        <div className="t-tags">
          {session.label&&<span className="t-tag">{session.label} London</span>}
          {isComingSoon&&<span className="t-tag soon">Coming soon</span>}
          {hot&&!soldOut&&<span className="t-tag hot">Selling fast</span>}
          {soldOut&&<span className="t-tag full">Sold out</span>}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
        <h2 className="t-title">{session.title}</h2>
        <div className="t-meta">
          <span>{fmtDateLong(session.date)}, {session.time}</span>
          <span>{session.venue}, London</span>
        </div>
      </div>

      {session.description&&(
        <div>
          <p className="t-desc">
            {expanded||session.description.length<=120 ? session.description : session.description.slice(0,120)+'…'}
          </p>
          {session.description.length>120&&(
            <button onClick={()=>setExpanded(!expanded)} className="t-link" aria-expanded={expanded} style={{marginTop:'0.375rem'}}>
              {expanded?'Show less':'Read more and map'}
            </button>
          )}
        </div>
      )}

      {/* Availability indicator */}
      <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
        {hot&&!soldOut&&(
          <div className="t-bar" aria-hidden="true"><span style={{width:`${Math.max(80,100-(spotsLeft??1)*4)}%`}}/></div>
        )}
        <div className="t-avail">
          <span className={'t-status '+(soldOut?'full':hot?'hot':'ok')}>
            {soldOut?'Sold out':hot?`Only ${spotsLeft} spot${spotsLeft===1?'':'s'} left`:'Tickets available'}
          </span>
          <span className="t-price"><span className="num">{fmt(session.price_pence)}</span> <span className="muted">/ person</span></span>
        </div>
        {session.max_tickets_per_order&&!soldOut&&<div className="t-hint" style={{marginTop:0}}>Max {session.max_tickets_per_order} per order</div>}
      </div>

      {/* Call to action */}
      <div className="t-actions">
        {isComingSoon?(
          <div className="t-soon" role="status">
            <ComingSoonCountdown opensAt={session.opens_at!} onUnlocked={onUnlocked??(() =>{})}/>
          </div>
        ):!soldOut?(
          <button onClick={()=>{fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:session.id,event:'book_now_click'})}).catch(()=>{});onSelect()}} className="book">
            Book now<Arrow/>
          </button>
        ):(
          <button onClick={onWaitlist} className="book">Join the waitlist<Arrow/></button>
        )}
      </div>

      <ShareButtons session={session}/>

      {/* Venue map — expandable */}
      {expanded&&<VenueMap venue={session.venue} maps_url={session.maps_url}/>}
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
  const viewsFiredRef=useRef(false)
  const fetchSessions=useCallback(async()=>{
    try{
      const res=await fetch('/api/sessions')
      if(!res.ok)return // silent: don't wipe state on transient server error
      const d=await res.json()
      // Only re-render if data actually changed — prevents page jitter on 15s auto-refresh
      const hash=JSON.stringify(d.sessions)
      if(hash!==sessionsHashRef.current){
        sessionsHashRef.current=hash
        const newSessions:Session[]=d.sessions??[]
        setSessions(newSessions)
        // Fire session_view events once per page load for all open sessions
        if(!viewsFiredRef.current&&newSessions.length>0){
          viewsFiredRef.current=true
          newSessions.filter(s=>s.status==='open'||s.status==='coming_soon').forEach(s=>{
            fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:s.id,event:'session_view'})}).catch(()=>{})
          })
        }
      }
      if(d.settings)setSettings(d.settings)
    }catch{
      // Network failure on auto-refresh — silently ignore, keep showing last data
    }finally{
      setLoading(false)
    }
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

      <a className="skip" href="#main-content">Skip to main content</a>

      <div className="t-hero">
        <header className="nav">
          <a href="https://theshuttlesocial.com" className="brand" aria-label="The Shuttle Social home">the shuttle social</a>
          <div className="nav-right">
            <a href="/account" className="book small">My portal<Arrow/></a>
            <ThemeToggle/>
          </div>
        </header>
        <div className="wrap t-hero-copy">
          <span className="kicker" style={{color:'var(--lime)'}}>Tickets</span>
          <h1 className="disp h1">Book your<br/><span className="t-word">next session.</span></h1>
          {settings.about_text&&<p className="lead t-about">{settings.about_text}</p>}
        </div>
      </div>

      <main id="main-content" className="wrap t-main">
        {loading?(
          <div className="t-loading" role="status">
            <div className="dot-row" aria-hidden="true"><span/><span/><span/></div>
            <div>Loading sessions…</div>
          </div>
        ):(
          <>
            {open.length>0&&(
              <section className="t-group" aria-labelledby="open-h">
                <h2 id="open-h" className="kicker t-group-h">Open for booking</h2>
                <div className="t-cards">
                  {open.map(s=><SessionCard key={s.id} session={s} onSelect={()=>setSelected(s)} onWaitlist={()=>setWaitlistSession(s)}/>)}
                </div>
              </section>
            )}
            {comingSoon.length>0&&(
              <section className="t-group" aria-labelledby="soon-h">
                <h2 id="soon-h" className="kicker t-group-h">Coming soon</h2>
                <div className="t-cards">
                  {comingSoon.map(s=><SessionCard key={s.id} session={s} onSelect={()=>{}} onWaitlist={()=>{}} onUnlocked={fetchSessions}/>)}
                </div>
              </section>
            )}
            {open.length===0&&comingSoon.length===0&&(
              <div className="t-empty">
                <div className="t-title" style={{marginBottom:'0.5rem'}}>No sessions open right now</div>
                <div className="small">New sessions are announced first on <a href={INSTAGRAM} target="_blank" rel="noopener">Instagram</a> and <a href={TIKTOK} target="_blank" rel="noopener">TikTok</a>.</div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="wrap t-foot">
        {/* Already booked? Self-service spot release */}
        <div className="t-release">
          <span className="muted small">Already booked but can’t make it?</span>
          <a href="/release" className="small">Release your spot →</a>
        </div>
        <div className="t-foot-links">
          <span>The Shuttle Social</span>
          <nav aria-label="Footer">
            <a href="https://theshuttlesocial.com">Home</a>
            <a href={INSTAGRAM} target="_blank" rel="noopener">Instagram</a>
            <a href={TIKTOK} target="_blank" rel="noopener">TikTok</a>
            <a href="/privacy">Privacy</a>
            <a href="#main-content" onClick={e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'})}}>Back to top ↑</a>
          </nav>
        </div>
      </footer>

      {selected&&(
        <ErrorBoundary>
          <BookingModal session={selected} termsText={settings.terms_and_conditions??''} onClose={()=>{setSelected(null);fetchSessions()}}/>
        </ErrorBoundary>
      )}
      {waitlistSession&&(
        <ErrorBoundary>
          <WaitlistModal session={waitlistSession} otherSessions={sessions.filter(s=>s.id!==waitlistSession.id&&s.status==='open')} onClose={()=>{setWaitlistSession(null);fetchSessions()}}/>
        </ErrorBoundary>
      )}
    </>
  )
}
