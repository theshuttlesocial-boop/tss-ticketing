'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const T = {
  bg:'#080f08', card:'#0f180f', card2:'#142014', border:'#1e3220',
  accent:'#6fcf40', accentDim:'rgba(111,207,64,0.1)', accentBorder:'rgba(111,207,64,0.25)',
  text:'#edf5ed', muted:'#6b8a6b', danger:'#e05555', dangerDim:'rgba(224,85,85,0.1)',
}
const fmtDate = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

interface Info { status:'pending'|'confirmed'|'expired'|'invalid'; fromName?:string; toName?:string; session?:{title:string;date:string;time:string;venue:string} }

export default function TransferConfirmPage(){
  const params=useParams<{token:string}>()
  const token=params?.token as string
  const [info,setInfo]=useState<Info|null>(null)
  const [loading,setLoading]=useState(false); const [error,setError]=useState('')
  const [confirmed,setConfirmed]=useState(false)

  useEffect(()=>{
    if(!token)return
    fetch(`/api/transfer/confirm?token=${encodeURIComponent(token)}`).then(r=>r.json()).then(setInfo).catch(()=>setInfo({status:'invalid'}))
  },[token])

  async function confirm(){
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/transfer/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})
      const d=await res.json()
      if(!res.ok){setError(d.error??'Something went wrong');return}
      setConfirmed(true)
    }catch{setError('Network error - please try again')}
    finally{setLoading(false)}
  }

  const panel:React.CSSProperties={background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:24,textAlign:'center'}

  return(
    <div style={{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:'system-ui,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:460}}>
        {!info&&<div style={{...panel,color:T.muted}}>Loading…</div>}

        {info&&confirmed&&(
          <div style={panel}>
            <div style={{fontSize:44,marginBottom:12}}>🏸</div>
            <div style={{fontSize:22,fontWeight:900,color:T.accent,marginBottom:8}}>You're confirmed!</div>
            <p style={{color:T.muted,fontSize:14,lineHeight:1.7}}>The spot is yours. We've emailed you the booking details. See you on court!</p>
            <a href="/tickets" style={{display:'inline-block',marginTop:20,padding:'12px 24px',background:T.accent,color:'#080f08',borderRadius:10,fontWeight:700,fontSize:14,textDecoration:'none'}}>View sessions</a>
          </div>
        )}

        {info&&!confirmed&&info.status==='pending'&&info.session&&(
          <div style={panel}>
            <div style={{fontSize:22,fontWeight:900,color:T.accent,marginBottom:6}}>You've been offered a spot</div>
            <p style={{color:T.muted,fontSize:14,marginBottom:18}}><strong style={{color:T.text}}>{info.fromName}</strong> would like you to take their place.</p>
            <div style={{background:T.card2,borderRadius:10,padding:16,textAlign:'left',marginBottom:18}}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>{info.session.title}</div>
              <div style={{fontSize:13,color:T.muted,lineHeight:1.7}}>{fmtDate(info.session.date)}, {info.session.time}<br/>{info.session.venue}</div>
            </div>
            {error&&<div style={{marginBottom:12,padding:'10px 12px',background:T.dangerDim,color:T.danger,borderRadius:8,fontSize:13}}>{error}</div>}
            <button onClick={confirm} disabled={loading} style={{width:'100%',padding:'14px',minHeight:52,borderRadius:10,border:'none',background:loading?T.border:T.accent,color:loading?T.muted:'#080f08',fontWeight:800,fontSize:16,cursor:loading?'default':'pointer',fontFamily:'inherit'}}>
              {loading?'Confirming…':'Confirm my place →'}
            </button>
          </div>
        )}

        {info&&!confirmed&&info.status==='confirmed'&&(
          <div style={panel}>
            <div style={{fontSize:20,fontWeight:800,color:T.accent,marginBottom:8}}>Already confirmed</div>
            <p style={{color:T.muted,fontSize:14}}>This spot has already been confirmed. Check your email for the booking details.</p>
          </div>
        )}

        {info&&!confirmed&&(info.status==='expired'||info.status==='invalid')&&(
          <div style={panel}>
            <div style={{fontSize:20,fontWeight:800,color:T.danger,marginBottom:8}}>{info.status==='expired'?'Link expired':'Link not valid'}</div>
            <p style={{color:T.muted,fontSize:14}}>{info.status==='expired'?'This transfer link has expired. Ask the person to send a new one.':"We couldn't find this transfer. The link may be incorrect."}</p>
          </div>
        )}
      </div>
    </div>
  )
}
