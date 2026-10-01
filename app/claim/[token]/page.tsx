'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { T, doneMark, stripeAppearance } from '@/app/_design/theme'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const fmtDate = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
const panel:React.CSSProperties={background:T.card,border:`1px solid ${T.border}`,borderRadius:24,padding:24,marginBottom:16}

interface Offer{ status:'valid'|'expired'|'claimed'|'declined'|'invalid'; spaces:number; name:string; email:string; phone:string
  claimExpiresAt?:string; competitive?:boolean; session?:{id:string;title:string;date:string;time:string;venue:string;label?:string} }

export default function ClaimPage(){
  const params=useParams<{token:string}>()
  const token=params?.token as string
  const [offer,setOffer]=useState<Offer|null>(null)
  const [clientSecret,setClientSecret]=useState('')
  const [starting,setStarting]=useState(false); const [error,setError]=useState(''); const [gone,setGone]=useState(false)
  const [done,setDone]=useState(false)
  // "Can't make it?" — also opened straight from the email (?decline=1)
  const [confirmDecline,setConfirmDecline]=useState(false); const [declined,setDeclined]=useState(false)
  useEffect(()=>{ if(new URLSearchParams(window.location.search).get('decline')==='1')setConfirmDecline(true) },[])

  async function decline(){
    setStarting(true)
    try{ await fetch('/api/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'decline'})}); setDeclined(true) }
    catch{ setError('Network error - please try again') }
    finally{ setStarting(false) }
  }

  useEffect(()=>{
    if(!token)return
    fetch(`/api/claim?token=${encodeURIComponent(token)}`).then(r=>r.json()).then(setOffer).catch(()=>setOffer({status:'invalid'} as Offer))
  },[token])

  async function startCheckout(){
    if(!offer?.session)return
    setStarting(true);setError('')
    try{
      const res=await fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({session_id:offer.session.id,name:offer.name,email:offer.email,phone:offer.phone,claim_token:token})})
      const d=await res.json()
      if(!res.ok){
        // Lost the competitive race, or offer expired — keep them on the list.
        if(res.status===409){ await fetch('/api/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>{}); setGone(true); return }
        setError(d.error??'Something went wrong');return
      }
      setClientSecret(d.clientSecret)
    }catch{setError('Network error - please try again')}
    finally{setStarting(false)}
  }

  const panelWrap=(children:React.ReactNode)=>(
    <div style={{minHeight:'60vh',color:T.text,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:460}}>{children}</div>
    </div>
  )

  if(!offer) return panelWrap(<div style={{...panel,color:T.muted,textAlign:'center'}}>Loading…</div>)

  if(done) return panelWrap(
    <div style={{...panel,textAlign:'center'}}>
      <div style={doneMark}>✓</div>
      <div style={{fontSize:22,fontWeight:900,color:T.accent,marginBottom:8}}>You're in!</div>
      <p style={{color:T.muted,fontSize:14,lineHeight:1.7}}>Your spot is confirmed and we've emailed your booking details. See you on court!</p>
      <a href="/tickets" style={{display:'inline-block',marginTop:20,padding:'12px 24px',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,borderRadius:999,fontWeight:700,fontSize:14,textDecoration:'none'}}>View sessions</a>
    </div>
  )

  if(gone) return panelWrap(
    <div style={{...panel,textAlign:'center'}}>
      <div style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:8}}>Sorry, that one's gone</div>
      <p style={{color:T.muted,fontSize:14,lineHeight:1.7}}>Someone claimed it first — but you're still on the waitlist and we'll message you if another spot opens up.</p>
      <a href="/tickets" style={{display:'inline-block',marginTop:20,padding:'12px 24px',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,borderRadius:999,fontWeight:700,fontSize:14,textDecoration:'none'}}>Back to sessions</a>
    </div>
  )

  if(declined||offer.status==='declined') return panelWrap(
    <div style={{...panel,textAlign:'center'}}>
      <div style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:8}}>Thanks for letting us know</div>
      <p style={{color:T.muted,fontSize:14,lineHeight:1.7}}>We&apos;ve passed the spot to the next person and taken you off this session&apos;s waitlist. Hope to see you at another session!</p>
      <a href="/tickets" style={{display:'inline-block',marginTop:20,padding:'12px 24px',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,borderRadius:999,fontWeight:700,fontSize:14,textDecoration:'none'}}>See other sessions</a>
    </div>
  )

  if(offer.status==='claimed') return panelWrap(<div style={{...panel,textAlign:'center'}}><div style={{fontSize:20,fontWeight:800,color:T.accent,marginBottom:8}}>Already claimed</div><p style={{color:T.muted,fontSize:14}}>This offer has already been claimed. Check your email for the booking details.</p></div>)
  if(offer.status==='expired') return panelWrap(<div style={{...panel,textAlign:'center'}}><div style={{fontSize:20,fontWeight:800,color:T.danger,marginBottom:8}}>Offer expired</div><p style={{color:T.muted,fontSize:14}}>This claim link has expired. You're still on the waitlist and we'll message you if another spot opens.</p></div>)
  if(offer.status==='invalid'||!offer.session) return panelWrap(<div style={{...panel,textAlign:'center'}}><div style={{fontSize:20,fontWeight:800,color:T.danger,marginBottom:8}}>Link not valid</div><p style={{color:T.muted,fontSize:14}}>We couldn't find this offer. The link may be incorrect.</p></div>)

  return panelWrap(
    <div style={panel}>
      <div style={{fontSize:22,fontWeight:900,color:T.accent,marginBottom:6}}>A spot's open for you!</div>
      <p style={{color:T.muted,fontSize:14,marginBottom:16}}>
        {offer.competitive
          ? <>Claim {offer.spaces} space{offer.spaces>1?'s':''}. It&apos;s session day, so everyone on the waitlist has been told: the first to pay gets it.</>
          : <>We&apos;re holding {offer.spaces} space{offer.spaces>1?'s':''} just for you{offer.claimExpiresAt?` until ${new Date(offer.claimExpiresAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'})}`:''}.</>}
      </p>
      <div style={{background:T.card2,borderRadius:18,padding:16,marginBottom:16}}>
        {offer.session.label&&<span style={{background:T.accentDim,color:T.accent,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${T.accentBorder}`,marginBottom:8,display:'inline-block'}}>{offer.session.label} London</span>}
        <div style={{fontWeight:800,fontSize:16}}>{offer.session.title}</div>
        <div style={{fontSize:13,color:T.muted,marginTop:6,lineHeight:1.7}}>{fmtDate(offer.session.date)}, {offer.session.time}<br/>{offer.session.venue}</div>
      </div>

      {error&&<div style={{marginBottom:12,padding:'10px 12px',background:T.dangerDim,color:T.danger,borderRadius:8,fontSize:13}}>{error}</div>}

      {confirmDecline&&!clientSecret?(
        <div style={{background:T.card2,borderRadius:18,padding:16}}>
          <div style={{fontWeight:800,marginBottom:6}}>Can&apos;t make it?</div>
          <p style={{color:T.muted,fontSize:13,lineHeight:1.6,margin:'0 0 12px'}}>We&apos;ll give the spot to the next person straight away and take you off this session&apos;s waitlist.</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={decline} disabled={starting} style={{flex:'1 1 160px',padding:'12px',borderRadius:999,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>{starting?'Passing it on…':'Yes, pass it on'}</button>
            <button onClick={()=>setConfirmDecline(false)} style={{flex:'1 1 160px',padding:'12px',borderRadius:999,border:'none',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,fontWeight:800,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>No, I want it</button>
          </div>
        </div>
      ):!clientSecret?(
        <>
        <button onClick={startCheckout} disabled={starting} style={{width:'100%',padding:'14px',minHeight:52,borderRadius:999,border:'none',background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,fontWeight:800,fontSize:16,cursor:starting?'default':'pointer',fontFamily:'inherit'}}>
          {starting?'Holding your spot…':'Claim & pay →'}
        </button>
        <button onClick={()=>setConfirmDecline(true)} style={{width:'100%',marginTop:10,padding:'10px',background:'none',border:'none',color:T.muted,fontSize:13,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline'}}>Can&apos;t make it? Pass it on</button>
        </>
      ):(
        <ClaimCheckout clientSecret={clientSecret} onSuccess={()=>setDone(true)} onGone={()=>setGone(true)}/>
      )}
    </div>
  )
}

function ClaimCheckout({clientSecret,onSuccess,onGone}:{clientSecret:string;onSuccess:()=>void;onGone:()=>void}){
  // Stripe needs real colours, not CSS variables: match the current light/dark theme.
  const options=useMemo(()=>({clientSecret,...stripeAppearance()}),[clientSecret])
  return <Elements stripe={stripePromise} options={options}><ClaimForm onSuccess={onSuccess} onGone={onGone}/></Elements>
}

function ClaimForm({onSuccess,onGone}:{onSuccess:()=>void;onGone:()=>void}){
  const stripe=useStripe(); const elements=useElements()
  const [paying,setPaying]=useState(false); const [ready,setReady]=useState(false); const [error,setError]=useState('')
  async function pay(){
    if(!stripe||!elements)return
    if(!elements.getElement(PaymentElement)){console.warn('[claim] PaymentElement not ready');return}
    setPaying(true);setError('')
    try{
      const {error:e}=await stripe.confirmPayment({elements,confirmParams:{return_url:`${window.location.origin}/tickets`},redirect:'if_required'})
      if(e){ const t=(e as any).type; if(t==='validation_error'){setError('')}else{setError(e.message??'Payment failed. Please try again.')} }
      else onSuccess()
    }catch(err:any){setError(err?.message??'Payment failed. Please try again.')}
    finally{setPaying(false)}
  }
  return(
    <div>
      <PaymentElement options={{layout:'accordion'}} onReady={()=>setReady(true)}/>
      {!ready&&<div style={{marginTop:10,padding:'10px 14px',background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,fontSize:13,textAlign:'center'}}>Loading payment form...</div>}
      {error&&<div style={{marginTop:12,padding:'10px 14px',background:T.dangerDim,color:T.danger,borderRadius:8,fontSize:13}}>{error}</div>}
      <button onClick={pay} disabled={paying||!stripe||!ready} style={{marginTop:16,width:'100%',padding:'16px',minHeight:56,borderRadius:999,background:T.cta,color:T.onCta,boxShadow:T.ctaGlow,border:'none',fontWeight:800,fontSize:18,cursor:(paying||!ready)?'default':'pointer',fontFamily:'inherit'}}>
        {paying?'Processing…':!ready?'Loading…':'Confirm & Pay →'}
      </button>
    </div>
  )
}
