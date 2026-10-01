'use client'
import { useEffect, useState } from 'react'
import { computeRefundQuote } from '@/lib/release'
import { T, inp, doneMark } from '@/app/_design/theme'
import { authHeader } from '@/lib/accountClient'

const fmt = (p:number) => `£${(p/100).toFixed(2)}`
const fmtDate = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

interface Booking {
  id:string; bookingRef:string; name:string; quantity:number; spacesReleased:number; maxReleasable:number
  pricePencePerSpace:number; hasConfirmedTransfer:boolean
  session:{ id:string; title:string; date:string; time:string; venue:string; label?:string }
}
type Step = 'email'|'link-sent'|'loading'|'link-invalid'|'choose'|'spaces'|'route'|'done'

const panel:React.CSSProperties = { background:T.card, border:`1px solid ${T.border}`, borderRadius:24, padding:22, marginBottom:16 }

export default function ReleasePage(){
  const [step,setStep]=useState<Step>('email')
  const [email,setEmail]=useState('')
  const [token,setToken]=useState('')
  const [loading,setLoading]=useState(false); const [error,setError]=useState('')
  const [bookings,setBookings]=useState<Booking[]>([])
  const [booking,setBooking]=useState<Booking|null>(null)
  const [priorCardRefunds,setPriorCardRefunds]=useState(0)
  const [spaces,setSpaces]=useState(1)
  const [route,setRoute]=useState<'A'|'B'|'C'|null>(null)
  const [done,setDone]=useState<{kind:'transfer'|'credit'|'card';toEmail?:string}|null>(null)

  // Magic link lands here with ?token=... Players signed in to My portal skip the
  // email step: their sign-in proves the email, so their bookings load straight away.
  useEffect(()=>{
    const t=new URLSearchParams(window.location.search).get('token')
    if(!t){
      (async()=>{
        const h=await authHeader()
        if(!('Authorization' in h))return
        const d=await fetch('/api/release/session',{headers:h}).then(r=>r.json()).catch(()=>null)
        if(d?.status!=='ok'||!d.bookings?.length)return   // nothing to manage: show the email step
        setPriorCardRefunds(d.priorCardRefunds??0);setBookings(d.bookings)
        if(d.bookings.length===1)pick(d.bookings[0]);else setStep('choose')
      })()
      return
    }
    setToken(t);setStep('loading')
    fetch(`/api/release/session?token=${encodeURIComponent(t)}`).then(r=>r.json()).then(d=>{
      if(d.status!=='ok'){setStep('link-invalid');return}
      setPriorCardRefunds(d.priorCardRefunds??0)
      setBookings(d.bookings)
      if(d.bookings.length===0){setStep('link-invalid')}
      else if(d.bookings.length===1){pick(d.bookings[0])}
      else{setStep('choose')}
    }).catch(()=>setStep('link-invalid'))
  },[])

  async function requestLink(){
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/release/request-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})})
      const d=await res.json()
      if(!res.ok){setError(d.error??'Something went wrong');return}
      setStep('link-sent')
    }catch{setError('Network error - please try again')}
    finally{setLoading(false)}
  }

  function pick(b:Booking){ setBooking(b);setSpaces(1);setRoute(null);setError('');setStep('spaces') }

  const quote = booking ? computeRefundQuote(booking.pricePencePerSpace, spaces, priorCardRefunds) : null

  return(
    <div style={{color:T.text}}>

      <main style={{maxWidth:520,margin:'0 auto',padding:'28px 20px 60px'}}>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:'0.14em',textTransform:'uppercase',color:T.muted,marginBottom:10}}>Release your spot</div>

        {/* STEP — request a magic link */}
        {step==='email'&&(
          <>
            <h1 style={{fontSize:34,fontWeight:900,letterSpacing:'-0.03em',marginBottom:8}}>Can't make it?</h1>
            <p style={{color:T.muted,fontSize:14,lineHeight:1.6,marginBottom:20}}>
              Enter the email you booked with and we'll send you a secure link to manage your spot. No booking reference needed. You can release up to 15 minutes before your session starts. Signed in to <a href="/account?next=/release" style={{color:T.accent}}>My portal</a>? Your bookings show straight away.
            </p>
            <div style={panel}>
              <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5}}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&email&&requestLink()} placeholder="you@email.com" autoComplete="email" style={inp()}/>
              {error&&<div style={{marginTop:12,padding:'10px 12px',background:T.dangerDim,color:T.danger,borderRadius:8,fontSize:13}}>{error}</div>}
              <button onClick={requestLink} disabled={!email||loading} style={{marginTop:16,width:'100%',padding:'14px',minHeight:52,borderRadius:999,border:'none',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,fontWeight:800,fontSize:16,cursor:(!email||loading)?'default':'pointer',fontFamily:'inherit'}}>
                {loading?'Sending…':'Email me a link →'}
              </button>
            </div>
          </>
        )}

        {/* STEP — link sent */}
        {step==='link-sent'&&(
          <div style={{...panel,textAlign:'center',padding:'32px 24px'}}>
            <div style={doneMark}>✉</div>
            <div style={{fontSize:22,fontWeight:900,color:T.accent,marginBottom:8}}>Check your email</div>
            <p style={{color:T.muted,fontSize:14,lineHeight:1.7}}>
              If <strong style={{color:T.text}}>{email}</strong> has an upcoming booking, we've sent a secure link to manage it. It works for 30 minutes.
            </p>
            <p style={{color:T.muted,fontSize:12,lineHeight:1.6,marginTop:12}}>Can't see it? Check spam, and add bookings@theshuttlesocial.com to your contacts.</p>
          </div>
        )}

        {/* STEP — loading from magic link */}
        {step==='loading'&&<div style={{...panel,color:T.muted,textAlign:'center'}}>Loading your booking…</div>}

        {/* STEP — link invalid/expired */}
        {step==='link-invalid'&&(
          <div style={{...panel,textAlign:'center',padding:'32px 24px'}}>
            <div style={{fontSize:20,fontWeight:800,color:T.danger,marginBottom:8}}>Link expired or not valid</div>
            <p style={{color:T.muted,fontSize:14,lineHeight:1.7,marginBottom:20}}>This link may have expired (they last 30 minutes), or there's no upcoming booking to manage. Releases close 15 minutes before a session starts.</p>
            <button onClick={()=>{setStep('email');setToken('')}} style={{padding:'12px 24px',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,border:'none',borderRadius:999,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>Request a new link</button>
          </div>
        )}

        {/* STEP — choose which booking (multiple upcoming) */}
        {step==='choose'&&(
          <>
            <h1 style={{fontSize:30,fontWeight:900,letterSpacing:'-0.03em',marginBottom:6}}>Which booking?</h1>
            <p style={{color:T.muted,fontSize:14,marginBottom:18}}>You have more than one upcoming booking. Pick the one you can't make.</p>
            {bookings.map(b=>(
              <button key={b.id} onClick={()=>pick(b)} style={{width:'100%',textAlign:'left',background:T.card,border:`1px solid ${T.border}`,borderRadius:20,padding:18,marginBottom:12,cursor:'pointer',fontFamily:'inherit'}}>
                {b.session.label&&<span style={{background:T.accentDim,color:T.accent,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${T.accentBorder}`,marginBottom:8,display:'inline-block'}}>{b.session.label} London</span>}
                <div style={{fontWeight:800,fontSize:16,color:T.text}}>{b.session.title}</div>
                <div style={{fontSize:13,color:T.muted,marginTop:4,lineHeight:1.6}}>{fmtDate(b.session.date)}, {b.session.time} · {b.session.venue}</div>
                <div style={{fontSize:12,color:T.muted,marginTop:8}}>Ref <strong style={{color:T.accent}}>{b.bookingRef}</strong> · {b.maxReleasable} spot{b.maxReleasable>1?'s':''} releasable</div>
              </button>
            ))}
          </>
        )}

        {/* STEP — choose how many spaces */}
        {step==='spaces'&&booking&&(
          <>
            <BookingHeader booking={booking}/>
            <div style={panel}>
              <div style={{fontSize:13,color:T.muted,marginBottom:10}}>How many spots do you want to release?</div>
              <div style={{display:'flex',gap:8}}>
                {Array.from({length:booking.maxReleasable},(_,i)=>i+1).map(n=>(
                  <button key={n} onClick={()=>setSpaces(n)} style={{flex:1,padding:'12px 0',borderRadius:8,cursor:'pointer',border:`1px solid ${spaces===n?T.accent:T.border}`,background:spaces===n?T.accentDim:T.card2,color:spaces===n?T.accent:T.text,fontWeight:700,fontSize:16,fontFamily:'inherit'}}>{n}</button>
                ))}
              </div>
              {booking.spacesReleased>0&&<div style={{fontSize:12,color:T.muted,marginTop:10}}>You've already released {booking.spacesReleased} of {booking.quantity} spot(s).</div>}
              <button onClick={()=>{setRoute(null);setError('');setStep('route')}} style={{marginTop:18,width:'100%',padding:'14px',minHeight:52,borderRadius:999,border:'none',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,fontWeight:800,fontSize:16,cursor:'pointer',fontFamily:'inherit'}}>
                Continue →
              </button>
              {bookings.length>1&&<button onClick={()=>setStep('choose')} style={{marginTop:10,width:'100%',padding:'10px',borderRadius:10,border:`1px solid ${T.border}`,background:'none',color:T.muted,fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Back</button>}
            </div>
          </>
        )}

        {/* STEP — choose route */}
        {step==='route'&&booking&&quote&&(
          <>
            <BookingHeader booking={booking}/>
            <div style={{fontSize:13,color:T.muted,marginBottom:12}}>Releasing <strong style={{color:T.text}}>{spaces}</strong> spot{spaces>1?'s':''}. Choose what happens next:</div>

            {!booking.hasConfirmedTransfer?(
              <RouteCard emphasised title="I've found my own replacement" badge="RECOMMENDED · FREE"
                subtitle="Give your spot to someone specific. No fee, and you settle up between yourselves." selected={route==='A'} onClick={()=>{setRoute('A');setError('')}}>
                {route==='A'&&<TransferForm booking={booking} spaces={spaces} token={token} onDone={(toEmail)=>{setDone({kind:'transfer',toEmail});setStep('done')}}/>}
              </RouteCard>
            ):(
              <div style={{...panel,opacity:0.7}}>
                <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Name change unavailable</div>
                <div style={{fontSize:13,color:T.muted}}>This ticket has already been transferred once.</div>
              </div>
            )}

            <RouteCard title="Credit for a future session" subtitle={`${fmt(quote.grossPence)} credit, valid 90 days. Available to everyone.`} selected={route==='B'} onClick={()=>{setRoute('B');setError('')}}>
              {route==='B'&&(
                <ConfirmRelease label={`Release for ${fmt(quote.grossPence)} credit`} loading={loading} onConfirm={()=>submitRelease('credit')} error={error}/>
              )}
            </RouteCard>

            <RouteCard title="Refund to my card" subtitle={quote.isFullRefund
                ? `Full refund: ${fmt(quote.refundPence)}`
                : `Refund: ${fmt(quote.refundPence)} (${fmt(quote.feePence)} admin fee)`} selected={route==='C'} onClick={()=>{setRoute('C');setError('')}}>
              {route==='C'&&(
                <>
                  {!quote.isFullRefund&&(
                    <div style={{marginBottom:12,padding:'10px 12px',background:T.infoDim,border:`1px solid rgba(96,180,255,0.3)`,borderRadius:8,color:T.info,fontSize:12,lineHeight:1.6}}>
                      A {fmt(quote.feePence)} admin fee applies - this would be your {priorCardRefunds+1}{ordinal(priorCardRefunds+1)} card refund in 90 days. Choose credit or a name change to avoid it.
                    </div>
                  )}
                  <ConfirmRelease label={`Release for ${fmt(quote.refundPence)} refund`} loading={loading} onConfirm={()=>submitRelease('card')} error={error}/>
                </>
              )}
            </RouteCard>

            <button onClick={()=>setStep('spaces')} style={{marginTop:4,width:'100%',padding:'10px',borderRadius:10,border:`1px solid ${T.border}`,background:'none',color:T.muted,fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Back</button>
          </>
        )}

        {/* STEP — confirmation */}
        {step==='done'&&done&&(
          <div style={{...panel,textAlign:'center',padding:'32px 24px'}}>
            <div style={doneMark}>{done.kind==='transfer'?'✉':'✓'}</div>
            {done.kind==='transfer'?(
              <>
                <div style={{fontSize:22,fontWeight:900,color:T.accent,marginBottom:8}}>Almost there</div>
                <p style={{color:T.muted,fontSize:14,lineHeight:1.7}}>
                  We've emailed <strong style={{color:T.text}}>{done.toEmail}</strong> a link to confirm. Your spot transfers to them as soon as they accept it (within 24 hours). No money changes hands.
                </p>
              </>
            ):(
              <>
                <div style={{fontSize:22,fontWeight:900,color:T.accent,marginBottom:8}}>Your spot is now open</div>
                <p style={{color:T.muted,fontSize:14,lineHeight:1.7}}>
                  Your spot is now open to the waitlist. <strong style={{color:T.text}}>You'll only be {done.kind==='credit'?'credited':'refunded'} once someone takes it.</strong> If nobody claims it before the session starts, we can't {done.kind==='credit'?'credit':'refund'} it and your booking stands.
                </p>
              </>
            )}
            <a href="/tickets" style={{display:'inline-block',marginTop:20,padding:'12px 24px',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,borderRadius:999,fontWeight:700,fontSize:14,textDecoration:'none'}}>Back to sessions</a>
          </div>
        )}
      </main>
    </div>
  )

  async function submitRelease(refundPreference:'credit'|'card'){
    if(!booking)return
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/release',{method:'POST',headers:{'Content-Type':'application/json',...(await authHeader())},body:JSON.stringify({bookingId:booking.id,token,spaces,refundPreference})})
      const d=await res.json()
      if(!res.ok){setError(d.error??'Something went wrong');return}
      setDone({kind:refundPreference});setStep('done')
    }catch{setError('Network error - please try again')}
    finally{setLoading(false)}
  }
}

function ordinal(n:number){const s=['th','st','nd','rd'],v=n%100;return s[(v-20)%10]||s[v]||s[0]}

function BookingHeader({booking}:{booking:Booking}){
  return(
    <div style={{...panel,marginBottom:16}}>
      {booking.session.label&&<span style={{background:T.accentDim,color:T.accent,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${T.accentBorder}`,marginBottom:8,display:'inline-block'}}>{booking.session.label} London</span>}
      <div style={{fontWeight:800,fontSize:18,color:T.text}}>{booking.session.title}</div>
      <div style={{fontSize:13,color:T.muted,marginTop:6,lineHeight:1.7}}>
        {fmtDate(booking.session.date)}, {booking.session.time}<br/>
        {booking.session.venue}
      </div>
      <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${T.border}`,fontSize:13,color:T.muted}}>
        Ref <strong style={{color:T.accent}}>{booking.bookingRef}</strong> · {booking.quantity} ticket{booking.quantity>1?'s':''} booked by {booking.name}
      </div>
    </div>
  )
}

function RouteCard({title,subtitle,badge,emphasised,selected,onClick,children}:{title:string;subtitle:string;badge?:string;emphasised?:boolean;selected:boolean;onClick:()=>void;children?:React.ReactNode}){
  return(
    <div style={{background:T.card,border:`1px solid ${selected?T.accent:emphasised?T.accentBorder:T.border}`,borderRadius:20,padding:18,marginBottom:14,boxShadow:emphasised&&!selected?`0 0 0 1px ${T.accentBorder}`:'none'}}>
      <div onClick={onClick} style={{cursor:'pointer',display:'flex',alignItems:'flex-start',gap:12}}>
        <div style={{width:20,height:20,borderRadius:'50%',border:`2px solid ${selected?T.accent:T.border}`,flexShrink:0,marginTop:2,display:'flex',alignItems:'center',justifyContent:'center'}}>
          {selected&&<div style={{width:10,height:10,borderRadius:'50%',background:T.accent}}/>}
        </div>
        <div style={{flex:1}}>
          {badge&&<span style={{background:T.accentDim,color:T.accent,fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:20,letterSpacing:0.5,marginBottom:6,display:'inline-block'}}>{badge}</span>}
          <div style={{fontWeight:700,fontSize:16,color:T.text}}>{title}</div>
          <div style={{fontSize:13,color:T.muted,marginTop:3,lineHeight:1.5}}>{subtitle}</div>
        </div>
      </div>
      {children&&<div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>{children}</div>}
    </div>
  )
}

function ConfirmRelease({label,onConfirm,loading,error}:{label:string;onConfirm:()=>void;loading:boolean;error:string}){
  return(
    <div>
      <div style={{padding:'10px 12px',background:T.card2,borderRadius:8,color:T.muted,fontSize:12,lineHeight:1.6,marginBottom:12}}>
        Your spot is offered to the waitlist. You're only paid out once someone takes it - if nobody does before the session, your booking stands.
      </div>
      {error&&<div style={{marginBottom:12,padding:'10px 12px',background:T.dangerDim,color:T.danger,borderRadius:8,fontSize:13}}>{error}</div>}
      <button onClick={onConfirm} disabled={loading} style={{width:'100%',padding:'13px',minHeight:50,borderRadius:999,border:'none',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,fontWeight:800,fontSize:15,cursor:loading?'default':'pointer',fontFamily:'inherit'}}>
        {loading?'Releasing…':label}
      </button>
    </div>
  )
}

function TransferForm({booking,spaces,token,onDone}:{booking:Booking;spaces:number;token:string;onDone:(toEmail:string)=>void}){
  const [toName,setToName]=useState(''); const [toEmail,setToEmail]=useState(''); const [toPhone,setToPhone]=useState('')
  const [consent,setConsent]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState('')

  async function submit(){
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/release/transfer',{method:'POST',headers:{'Content-Type':'application/json',...(await authHeader())},body:JSON.stringify({bookingId:booking.id,token,spaces,toName,toEmail,toPhone,consent})})
      const d=await res.json()
      if(!res.ok){setError(d.error??'Something went wrong');return}
      onDone(d.toEmail??toEmail)
    }catch{setError('Network error - please try again')}
    finally{setLoading(false)}
  }
  const ready=toName.trim()&&toEmail.trim()&&consent

  return(
    <div>
      <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5}}>Their full name</label>
      <input value={toName} onChange={e=>setToName(e.target.value)} placeholder="Replacement's name" style={{...inp(),marginBottom:12}}/>
      <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5}}>Their email</label>
      <input type="email" value={toEmail} onChange={e=>setToEmail(e.target.value)} placeholder="them@email.com" style={{...inp(),marginBottom:12}}/>
      <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5}}>Their phone (optional)</label>
      <input type="tel" value={toPhone} onChange={e=>setToPhone(e.target.value)} placeholder="+44 7700 000000" style={{...inp(),marginBottom:14}}/>
      <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',marginBottom:14}}>
        <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} style={{marginTop:2,width:16,height:16,accentColor:T.accent}}/>
        <span style={{fontSize:13,color:T.muted,lineHeight:1.5}}>I confirm this person has agreed to take my place and to us contacting them about it.</span>
      </label>
      {error&&<div style={{marginBottom:12,padding:'10px 12px',background:T.dangerDim,color:T.danger,borderRadius:8,fontSize:13}}>{error}</div>}
      <button onClick={submit} disabled={!ready||loading} style={{width:'100%',padding:'13px',minHeight:50,borderRadius:999,border:'none',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,fontWeight:800,fontSize:15,cursor:(!ready||loading)?'default':'pointer',fontFamily:'inherit'}}>
        {loading?'Sending…':'Send them a confirm link →'}
      </button>
    </div>
  )
}
