'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'

// ── Midnight Green Theme ──────────────────────────────────────────────────────
const T = {
  bg:'#080f08', card:'#0f180f', card2:'#142014', border:'#1e3220', borderHover:'#2d4a2d',
  accent:'#6fcf40', accentDim:'rgba(111,207,64,0.1)', accentBorder:'rgba(111,207,64,0.25)',
  text:'#edf5ed', muted:'#6b8a6b', danger:'#e05555', dangerDim:'rgba(224,85,85,0.1)',
  warning:'#e09040', info:'#60b4ff', infoDim:'rgba(96,180,255,0.08)',
}
const inp = (extra?:object):React.CSSProperties => ({ width:'100%', background:T.card2, border:`1px solid ${T.border}`, borderRadius:8, padding:'10px 13px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit', ...extra })
const cardStyle:React.CSSProperties = { background:T.card, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:16 }

const fmt = (p:number) => `£${(p/100).toFixed(2)}`
const fmtDate = (d:string) => new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})
const SC:Record<string,string> = {open:T.accent,draft:T.muted,closed:T.warning,cancelled:T.danger,scheduled:T.info}

interface Session { id:string;title:string;label?:string;venue:string;region:string;date:string;time:string;capacity:number;price_pence:number;status:string;booked:number;revenue_pence:number;opens_at?:string;description?:string;is_recurring?:boolean;recurring_parent_id?:string;cancelled_occurrence?:boolean;waitlist_count:number }
interface Booking { id:string;name:string;email:string;phone?:string;quantity:number;total_pence:number;booking_ref:string;created_at:string;stripe_status:string;additional_attendees?:any;sessions?:{title:string;date:string;venue:string;label?:string} }

function displayStatus(s:Session):{label:string;color:string} {
  if (s.opens_at && new Date(s.opens_at)>new Date() && s.status==='draft') return {label:`⏰ ${new Date(s.opens_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`,color:T.info}
  if (s.status==='open') return {label:'✅ Open',color:T.accent}
  if (s.status==='draft') return {label:'🔒 Draft',color:T.muted}
  if (s.status==='closed') return {label:'🚫 Closed',color:T.warning}
  return {label:'❌ Cancelled',color:T.danger}
}

// ── Debounced input to fix typing lag ─────────────────────────────────────────
function DebouncedTextarea({ value, onChange, ...props }: { value:string; onChange:(v:string)=>void; [k:string]:any }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  useEffect(() => { const t = setTimeout(()=>onChange(local),400); return ()=>clearTimeout(t) }, [local])
  return <textarea {...props} value={local} onChange={e=>setLocal(e.target.value)}/>
}
function DebouncedInput({ value, onChange, ...props }: { value:string; onChange:(v:string)=>void; [k:string]:any }) {
  const [local, setLocal] = useState(value)
  useEffect(()=>{ setLocal(value) },[value])
  useEffect(()=>{ const t=setTimeout(()=>onChange(local),300); return ()=>clearTimeout(t) },[local])
  return <input {...props} value={local} onChange={e=>setLocal(e.target.value)}/>
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <div style={{marginBottom:14}}><label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</label>{children}</div>
}

function StatCard({label,value,color,sub}:{label:string;value:string;color?:string;sub?:string}) {
  return (
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:'14px 16px'}}>
      <div style={{fontSize:11,color:T.muted,marginBottom:4}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color??T.text}}>{value}</div>
      {sub && <div style={{fontSize:11,color:T.muted,marginTop:2}}>{sub}</div>}
    </div>
  )
}

const VENUES=['Harrow High School','Frances Bardsley Academy','Dormers Wells Leisure Centre','Sylvestrian Leisure Centre','Walthamstow Academy','Other']
const REGIONS=['North/West London','East London','South London','Central London']
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export default function AdminPage() {
  const [secret,setSecret]=useState(''); const [authed,setAuthed]=useState(false)
  const [sessions,setSessions]=useState<Session[]>([]); const [bookings,setBookings]=useState<Booking[]>([])
  const [waitlist,setWaitlist]=useState<any[]>([]); const [analytics,setAnalytics]=useState<any>(null)
  const [tab,setTab]=useState<'overview'|'sessions'|'create'|'bookings'|'attendees'|'analytics'|'settings'>('overview')
  const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [msg,setMsg]=useState('')
  const [editing,setEditing]=useState<Session|null>(null)
  const [filterSession,setFilterSession]=useState(''); const [filterStatus,setFilterStatus]=useState('')
  const [settings,setSettings]=useState<Record<string,string>>({})
  const [form,setForm]=useState({title:'',label:'West',venue:'',customVenue:'',region:'North/West London',date:'',time:'19:00',capacity:24,price_pence:800,status:'draft',releaseMode:'manual',releaseDateTime:'',description:'',is_recurring:false,recurring_day_of_week:4})
  const [refunding,setRefunding]=useState<string|null>(null)

  function flash(m:string){setMsg(m);setTimeout(()=>setMsg(''),3500)}

  async function login(){
    setLoading(true);setError('')
    const res=await fetch('/api/admin',{headers:{'x-admin-secret':secret}})
    if(!res.ok){setError('Wrong password');setLoading(false);return}
    const d=await res.json();setSessions(d.sessions??[]);if(d.settings)setSettings(d.settings);setAuthed(true);setLoading(false)
  }

  const reload = useCallback(async()=>{
    const res=await fetch('/api/admin',{headers:{'x-admin-secret':secret}})
    const d=await res.json();setSessions(d.sessions??[]);if(d.settings)setSettings(d.settings)
  },[secret])

  async function patch(id:string,u:Record<string,any>){
    await fetch('/api/admin',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-secret':secret},body:JSON.stringify({session_id:id,...u})})
    flash('✅ Saved!');reload();setEditing(null)
  }

  async function saveSetting(key:string,value:string){
    await fetch('/api/admin',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-secret':secret},body:JSON.stringify({setting_key:key,setting_value:value})})
    flash('✅ Saved!')
  }

  async function create(){
    setLoading(true);setError('')
    const venue=form.venue==='Other'?form.customVenue:form.venue
    const opens_at=form.releaseMode==='scheduled'&&form.releaseDateTime?new Date(form.releaseDateTime).toISOString():null
    const res=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json','x-admin-secret':secret},body:JSON.stringify({
      title:form.title||(form.label?`TSS ${form.label} — ${venue}`:`TSS — ${venue}`),
      label:form.label,venue,region:form.region,date:form.date,time:form.time,
      capacity:Number(form.capacity),price_pence:Number(form.price_pence),
      status:opens_at?'draft':form.status,opens_at,description:form.description||null,
      is_recurring:form.is_recurring,recurring_day_of_week:form.is_recurring?Number(form.recurring_day_of_week):null
    })})
    setLoading(false)
    if(res.ok){flash('✅ Session created!');setForm({title:'',label:'West',venue:'',customVenue:'',region:'North/West London',date:'',time:'19:00',capacity:24,price_pence:800,status:'draft',releaseMode:'manual',releaseDateTime:'',description:'',is_recurring:false,recurring_day_of_week:4});reload();setTab('sessions')}
    else{const d=await res.json();setError(d.error??'Failed')}
  }

  async function loadBookings(){
    const url=filterSession?`/api/admin?type=bookings&session_id=${filterSession}`:'/api/admin?type=bookings'
    const res=await fetch(url,{headers:{'x-admin-secret':secret}})
    const d=await res.json();setBookings(d.bookings??[])
  }

  async function loadWaitlist(){
    const url=filterSession?`/api/admin?type=waitlist&session_id=${filterSession}`:'/api/admin?type=waitlist'
    const res=await fetch(url,{headers:{'x-admin-secret':secret}})
    const d=await res.json();setWaitlist(d.waitlist??[])
  }

  async function loadAnalytics(){
    const res=await fetch('/api/admin?type=analytics',{headers:{'x-admin-secret':secret}})
    const d=await res.json();setAnalytics(d)
  }

  async function refund(bookingId:string,bookingRef:string){
    if(!confirm(`Refund booking ${bookingRef}? This cannot be undone.`))return
    setRefunding(bookingId)
    const res=await fetch('/api/refund',{method:'POST',headers:{'Content-Type':'application/json','x-admin-secret':secret},body:JSON.stringify({booking_id:bookingId,reason:'Admin refund'})})
    const d=await res.json();setRefunding(null)
    if(res.ok){flash(`✅ Refunded ${fmt(d.amount_refunded)}`);loadBookings()}
    else flash(`❌ Refund failed: ${d.error}`)
  }

  function exportCSV(data:any[],filename:string){
    if(!data.length)return
    const keys=Object.keys(data[0]).filter(k=>typeof data[0][k]!=='object')
    const csv=[keys.join(','),...data.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n')
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=filename;a.click()
  }

  async function deleteSession(id:string,title:string){
    if(!confirm(`Delete "${title}"? This cannot be undone.`))return
    const res=await fetch(`/api/sessions?id=${id}`,{method:'DELETE',headers:{'x-admin-secret':secret}})
    if(res.ok){flash('✅ Session deleted');setEditing(null);reload()}
    else{const d=await res.json();flash(`❌ Delete failed: ${d.error}`)}
  }

  async function generateNextRecurring(parentId:string){
    const res=await fetch('/api/recurring',{method:'POST',headers:{'Content-Type':'application/json','x-admin-secret':secret},body:JSON.stringify({parent_id:parentId})})
    if(res.ok){flash('✅ Next occurrence created as Draft');reload()}
    else flash('❌ Failed to create next occurrence')
  }

  useEffect(()=>{
    if(!authed)return
    if(tab==='bookings')loadBookings()
    if(tab==='attendees'){loadBookings();loadWaitlist()}
    if(tab==='analytics')loadAnalytics()
  },[authed,tab,filterSession])

  const summary = useMemo(()=>({
    totalRev: sessions.reduce((a,s)=>a+(s.revenue_pence??0),0),
    totalBooked: sessions.reduce((a,s)=>a+(s.booked??0),0),
    openCount: sessions.filter(s=>s.status==='open').length,
  }),[sessions])

  // ── Login ─────────────────────────────────────────────────────────────────
  if(!authed) return(
    <div style={{...{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:'system-ui,sans-serif'},display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:32,width:'100%',maxWidth:360}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <div style={{width:44,height:44,borderRadius:'50%',background:'#1a3a1a',border:`2px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,overflow:'hidden'}}>
            <img src="/logo.jpg" alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{(e.target as HTMLImageElement).style.display='none'}}/>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:18,color:T.accent,lineHeight:1}}>TSS Admin</div>
            <div style={{fontSize:11,color:T.muted}}>The Shuttle Social</div>
          </div>
        </div>
        <input type="password" value={secret} onChange={e=>setSecret(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="Admin password" style={{...inp(),marginBottom:12}}/>
        {error&&<div style={{color:T.danger,fontSize:13,marginBottom:10}}>{error}</div>}
        <button onClick={login} disabled={loading} style={{width:'100%',padding:12,background:T.accent,color:'#080f08',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>{loading?'Checking…':'Login →'}</button>
      </div>
    </div>
  )

  const base:React.CSSProperties={minHeight:'100vh',background:T.bg,color:T.text,fontFamily:'system-ui,sans-serif'}
  const tabs=[['overview','📊'],['sessions','📅'],['create','➕'],['bookings','🎟'],['attendees','👥'],['analytics','📈'],['settings','⚙️']]
  const tabLabels:Record<string,string>={overview:'Overview',sessions:'Sessions',create:'New Session',bookings:'Bookings',attendees:'Attendees',analytics:'Analytics',settings:'Settings'}

  return(
    <div style={base}>
      {/* Header */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:T.bg,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:38,height:38,borderRadius:'50%',background:'#1a3a1a',border:`2px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
            <img src="/logo.jpg" alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{(e.target as HTMLImageElement).style.display='none';(e.target as HTMLImageElement).parentElement!.textContent='🏸'}}/>
          </div>
          <div style={{fontWeight:800,fontSize:16,color:T.accent}}>TSS Admin</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {msg&&<div style={{fontSize:12,color:T.accent,padding:'5px 12px',background:T.accentDim,borderRadius:20,border:`1px solid ${T.accentBorder}`}}>{msg}</div>}
          <a href="/tickets" target="_blank" style={{fontSize:12,color:T.muted,textDecoration:'none',padding:'5px 12px',border:`1px solid ${T.border}`,borderRadius:8}}>View site ↗</a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:'0 20px',display:'flex',gap:2,overflowX:'auto' as const}}>
        {tabs.map(([k,icon])=>(
          <button key={k} onClick={()=>setTab(k as any)} style={{padding:'10px 14px',border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:'none',color:tab===k?T.accent:T.muted,borderBottom:`2px solid ${tab===k?T.accent:'transparent'}`,whiteSpace:'nowrap' as const,fontFamily:'inherit'}}>
            {icon} {tabLabels[k]}
          </button>
        ))}
      </div>

      <div style={{maxWidth:900,margin:'0 auto',padding:'24px 20px'}}>

        {/* OVERVIEW */}
        {tab==='overview'&&(
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:20}}>
              <StatCard label="Open Sessions" value={String(summary.openCount)} color={T.accent}/>
              <StatCard label="Total Booked" value={String(summary.totalBooked)} color={T.text}/>
              <StatCard label="All-time Revenue" value={fmt(summary.totalRev)} color={T.accent}/>
              <StatCard label="Total Sessions" value={String(sessions.length)} color={T.text}/>
            </div>
            <div style={cardStyle}>
              <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>Session Status</div>
              {sessions.slice(0,8).map(s=>{const ds=displayStatus(s);return(
                <div key={s.id} style={{padding:'11px 18px',borderBottom:`1px solid #0a140a`,display:'flex',alignItems:'center',gap:12}}>
                  <div style={{minWidth:36}}><div style={{fontWeight:700,fontSize:15,color:T.accent}}>{new Date(s.date).getDate()}</div><div style={{fontSize:9,color:T.muted}}>{new Date(s.date).toLocaleString('en-GB',{month:'short'})}</div></div>
                  <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{s.title}</div><div style={{fontSize:11,color:T.muted}}>{s.venue}</div></div>
                  <div style={{fontSize:13,color:T.muted}}>{s.booked}/{s.capacity}</div>
                  {s.waitlist_count>0&&<div style={{fontSize:11,color:T.info}}>+{s.waitlist_count} waitlist</div>}
                  <div style={{padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:600,background:`${ds.color}18`,color:ds.color,whiteSpace:'nowrap' as const}}>{ds.label}</div>
                </div>
              )})}
            </div>
          </>
        )}

        {/* SESSIONS */}
        {tab==='sessions'&&(
          editing?(
            <SessionEditor session={editing} onSave={async u=>{await patch(editing.id,u);setEditing(null)}} onCancel={()=>setEditing(null)} onStatusChange={async s=>patch(editing.id,{status:s,opens_at:null})} onSchedule={async dt=>patch(editing.id,{status:'draft',opens_at:new Date(dt).toISOString()})} onGenerateNext={()=>generateNextRecurring(editing.id)} onDelete={()=>deleteSession(editing.id,editing.title)} secret={secret} flash={flash} reload={reload}/>
          ):(
            <div style={cardStyle}>
              <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>All Sessions — tap to edit</div>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{...inp({width:'auto',padding:'5px 10px',fontSize:12})}}>
                  <option value="">All statuses</option>
                  {['open','draft','closed','cancelled'].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {sessions.filter(s=>!filterStatus||s.status===filterStatus).map(s=>{
                const pct=Math.round((s.booked/s.capacity)*100); const ds=displayStatus(s)
                return(
                  <div key={s.id} onClick={()=>setEditing(s)} style={{padding:'13px 18px',borderBottom:`1px solid #0a140a`,display:'flex',alignItems:'center',gap:12,cursor:'pointer',transition:'background 0.1s'}} onMouseEnter={e=>(e.currentTarget.style.background=T.card2)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{minWidth:44,textAlign:'center',background:T.accentDim,borderRadius:8,padding:'5px 0'}}>
                      <div style={{fontWeight:800,fontSize:17,color:T.accent,lineHeight:1}}>{new Date(s.date).getDate()}</div>
                      <div style={{fontSize:9,color:T.muted}}>{new Date(s.date).toLocaleString('en-GB',{month:'short'})}</div>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:14,marginBottom:1}}>
                        {s.label&&<span style={{fontSize:10,background:T.accentDim,color:T.accent,padding:'1px 6px',borderRadius:10,marginRight:6}}>{s.label}</span>}
                        {s.title}
                        {s.is_recurring&&<span style={{fontSize:10,color:T.info,marginLeft:6}}>↻ recurring</span>}
                      </div>
                      <div style={{fontSize:11,color:T.muted,marginBottom:5}}>{s.venue} · {s.time}</div>
                      <div style={{height:3,background:T.border,borderRadius:2}}><div style={{height:'100%',width:`${pct}%`,background:pct>=90?T.danger:pct>=70?T.warning:T.accent,borderRadius:2}}/></div>
                    </div>
                    <div style={{textAlign:'right',minWidth:80}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.accent}}>{s.booked}/{s.capacity}</div>
                      {s.waitlist_count>0&&<div style={{fontSize:10,color:T.info}}>+{s.waitlist_count}</div>}
                      <div style={{padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:600,marginTop:3,background:`${ds.color}18`,color:ds.color,display:'inline-block'}}>{ds.label}</div>
                    </div>
                    <div style={{color:T.muted,fontSize:16}}>›</div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* CREATE */}
        {tab==='create'&&(
          <div style={cardStyle}>
            <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>Create New Session</div>
            <div style={{padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <Field label="Session Label"><select value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} style={inp()}><option>West</option><option>East</option><option>South</option><option>Central</option><option>Special</option></select></Field>
                <Field label="Region"><select value={form.region} onChange={e=>setForm(f=>({...f,region:e.target.value}))} style={inp()}>{REGIONS.map(r=><option key={r}>{r}</option>)}</select></Field>
                <Field label="Venue"><select value={form.venue} onChange={e=>setForm(f=>({...f,venue:e.target.value}))} style={inp()}><option value="">— Select —</option>{VENUES.map(v=><option key={v}>{v}</option>)}</select></Field>
                {form.venue==='Other'&&<Field label="Custom Venue"><input value={form.customVenue} onChange={e=>setForm(f=>({...f,customVenue:e.target.value}))} style={inp()}/></Field>}
                <Field label="Session Title (optional)"><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder={`TSS ${form.label} — ${form.venue||'venue'}`} style={inp()}/></Field>
                <Field label="Date"><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp()}/></Field>
                <Field label="Start Time"><input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} style={inp()}/></Field>
                <Field label="Capacity"><input type="number" value={form.capacity} onChange={e=>setForm(f=>({...f,capacity:Number(e.target.value)}))} min={1} style={inp()}/></Field>
                <Field label="Price (£)"><input type="number" value={form.price_pence/100} onChange={e=>setForm(f=>({...f,price_pence:Math.round(Number(e.target.value)*100)}))} min={1} step={0.5} style={inp()}/></Field>
              </div>

              <Field label="Description — venue address, parking, directions, what to bring">
                <DebouncedTextarea value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} rows={3} placeholder="e.g. Harrow High School, HA1 3JL. Free parking on site via main gates on Gayton Road." style={inp({resize:'vertical',lineHeight:1.6})}/>
              </Field>

              {/* Recurring */}
              <div style={{padding:'14px',background:'#0a140a',borderRadius:10,marginBottom:16}}>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:form.is_recurring?12:0}}>
                  <input type="checkbox" checked={form.is_recurring} onChange={e=>setForm(f=>({...f,is_recurring:e.target.checked}))} style={{accentColor:T.accent,width:16,height:16}}/>
                  <span style={{fontSize:13,fontWeight:600,color:T.text}}>↻ Recurring session (auto-creates weekly)</span>
                </label>
                {form.is_recurring&&(
                  <div style={{marginTop:8}}>
                    <Field label="Repeats every week on">
                      <select value={form.recurring_day_of_week} onChange={e=>setForm(f=>({...f,recurring_day_of_week:Number(e.target.value)}))} style={inp()}>
                        {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
                      </select>
                    </Field>
                    <div style={{fontSize:12,color:T.muted}}>Next week's session will auto-create as Draft. You can cancel individual weeks without affecting the series.</div>
                  </div>
                )}
              </div>

              {/* Release mode */}
              <div style={{padding:'14px',background:'#0a140a',borderRadius:10,marginBottom:16}}>
                <div style={{fontSize:12,color:T.muted,marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>🎯 Ticket Release</div>
                <div style={{display:'flex',gap:8,marginBottom:12}}>
                  {[['manual','🔒 Keep Draft'],['now','✅ Open Now'],['scheduled','⏰ Schedule Drop']].map(([k,l])=>(
                    <button key={k} onClick={()=>setForm(f=>({...f,releaseMode:k,status:k==='now'?'open':'draft'}))} style={{padding:'8px 12px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,flex:1,background:form.releaseMode===k?T.accentDim:'#142014',color:form.releaseMode===k?T.accent:T.muted,outline:form.releaseMode===k?`1px solid ${T.accentBorder}`:'none',fontFamily:'inherit'}}>{l}</button>
                  ))}
                </div>
                {form.releaseMode==='scheduled'&&(
                  <Field label="Release Date & Time">
                    <input type="datetime-local" value={form.releaseDateTime} onChange={e=>setForm(f=>({...f,releaseDateTime:e.target.value}))} style={{...inp(),borderColor:'rgba(96,180,255,0.4)'}}/>
                  </Field>
                )}
              </div>

              {error&&<div style={{color:T.danger,marginBottom:12,fontSize:13}}>{error}</div>}
              <button onClick={create} disabled={loading||!form.date||!form.venue||(form.venue==='Other'&&!form.customVenue)} style={{padding:'12px 28px',background:T.accent,color:'#080f08',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit',opacity:loading?0.6:1}}>
                {loading?'Creating…':'➕ Create Session'}
              </button>
            </div>
          </div>
        )}

        {/* BOOKINGS */}
        {tab==='bookings'&&(
          <>
            <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' as const}}>
              <select value={filterSession} onChange={e=>setFilterSession(e.target.value)} style={{...inp({width:'auto',flex:1,minWidth:200})}}>
                <option value="">All sessions</option>
                {sessions.map(s=><option key={s.id} value={s.id}>{fmtDate(s.date)} — {s.title}</option>)}
              </select>
              <button onClick={()=>exportCSV(bookings.map(b=>({ref:b.booking_ref,name:b.name,email:b.email,phone:b.phone??'',tickets:b.quantity,total:fmt(b.total_pence),date:new Date(b.created_at).toLocaleString('en-GB'),session:b.sessions?.title??''})),'tss-bookings.csv')} style={{padding:'10px 16px',background:T.accentDim,color:T.accent,border:`1px solid ${T.accentBorder}`,borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'}}>
                📥 Export CSV
              </button>
            </div>
            <div style={cardStyle}>
              <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>
                Confirmed Bookings ({bookings.filter(b=>b.stripe_status==='succeeded').length})
              </div>
              {bookings.length===0&&<div style={{padding:40,textAlign:'center',color:T.muted}}>No bookings found</div>}
              {bookings.map((b,i)=>{
                const isRefunded=b.stripe_status==='refunded'
                const attendees=b.additional_attendees?(typeof b.additional_attendees==='string'?JSON.parse(b.additional_attendees):b.additional_attendees):[]
                return(
                  <div key={b.id} style={{padding:'13px 18px',borderBottom:i<bookings.length-1?`1px solid #0a140a`:'none',display:'flex',justifyContent:'space-between',alignItems:'flex-start',opacity:isRefunded?0.6:1}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:14,color:isRefunded?T.muted:T.text}}>{b.name} {isRefunded&&<span style={{fontSize:11,color:T.danger,background:T.dangerDim,padding:'1px 6px',borderRadius:10}}>refunded</span>}</div>
                      <div style={{fontSize:12,color:T.muted}}>{b.email}{b.phone?` · ${b.phone}`:''}</div>
                      {attendees.length>0&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>+{attendees.map((a:any)=>a.name??a).join(', ')}</div>}
                      <div style={{fontSize:11,color:'#2a4a2a',marginTop:2}}>{b.booking_ref} · {new Date(b.created_at).toLocaleString('en-GB')}</div>
                    </div>
                    <div style={{textAlign:'right',display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:6}}>
                      <div style={{color:T.accent,fontWeight:700,fontSize:15}}>{fmt(b.total_pence)}</div>
                      <div style={{fontSize:12,color:T.muted}}>{b.quantity} ticket{b.quantity>1?'s':''}</div>
                      {!isRefunded&&b.stripe_status==='succeeded'&&(
                        <button onClick={()=>refund(b.id,b.booking_ref)} disabled={refunding===b.id} style={{padding:'4px 10px',background:T.dangerDim,color:T.danger,border:`1px solid rgba(224,85,85,0.25)`,borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'inherit'}}>
                          {refunding===b.id?'Refunding…':'↩ Refund'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ATTENDEES */}
        {tab==='attendees'&&(
          <>
            <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' as const}}>
              <select value={filterSession} onChange={e=>setFilterSession(e.target.value)} style={{...inp({width:'auto',flex:1,minWidth:200})}}>
                <option value="">All sessions</option>
                {sessions.map(s=><option key={s.id} value={s.id}>{fmtDate(s.date)} — {s.title}</option>)}
              </select>
              <button onClick={()=>exportCSV(bookings.filter(b=>b.stripe_status==='succeeded').map(b=>({name:b.name,email:b.email,phone:b.phone??'',tickets:b.quantity,ref:b.booking_ref,session:b.sessions?.title??'',date:b.sessions?.date??''})),'tss-attendees.csv')} style={{padding:'10px 16px',background:T.accentDim,color:T.accent,border:`1px solid ${T.accentBorder}`,borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'}}>
                📥 Export Names
              </button>
            </div>

            {/* Confirmed attendees */}
            <div style={cardStyle}>
              <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>
                Confirmed Attendees ({bookings.filter(b=>b.stripe_status==='succeeded').reduce((a,b)=>a+b.quantity,0)})
              </div>
              {bookings.filter(b=>b.stripe_status==='succeeded').map((b,i,arr)=>{
                const attendees=b.additional_attendees?(typeof b.additional_attendees==='string'?JSON.parse(b.additional_attendees):b.additional_attendees):[]
                return(
                  <div key={b.id} style={{padding:'10px 18px',borderBottom:i<arr.length-1?`1px solid #0a140a`:'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:14}}>{b.name}</div>
                      {attendees.map((a:any,j:number)=><div key={j} style={{fontSize:12,color:T.muted}}>↳ {a.name??a}</div>)}
                      <div style={{fontSize:11,color:T.muted}}>{b.email} · {b.phone}</div>
                    </div>
                    <div style={{fontSize:12,color:T.muted,textAlign:'right'}}>
                      <div>{b.quantity} ticket{b.quantity>1?'s':''}</div>
                      <div style={{fontSize:10}}>{b.booking_ref}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Waitlist */}
            {waitlist.length>0&&(
              <div style={cardStyle}>
                <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>
                  Waitlist ({waitlist.length})
                </div>
                {waitlist.map((w,i)=>(
                  <div key={w.id} style={{padding:'10px 18px',borderBottom:i<waitlist.length-1?`1px solid #0a140a`:'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:T.infoDim,border:`1px solid rgba(96,180,255,0.25)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:T.info}}>#{w.position}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:14}}>{w.name}</div>
                        <div style={{fontSize:11,color:T.muted}}>{w.email} · {w.phone}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:T.muted}}>{w.sessions?.title}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ANALYTICS */}
        {tab==='analytics'&&(
          analytics?(
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:20}}>
                <StatCard label="Total Revenue" value={fmt(analytics.revenueBySession.reduce((a:number,s:any)=>a+s.revenue,0))} color={T.accent}/>
                <StatCard label="Total Tickets Sold" value={String(analytics.revenueBySession.reduce((a:number,s:any)=>a+s.tickets,0))} color={T.text}/>
                <StatCard label="Sessions with Bookings" value={String(analytics.revenueBySession.length)} color={T.text}/>
                <StatCard label="Top Attendee" value={analytics.topAttendees[0]?.name??'—'} sub={analytics.topAttendees[0]?`${analytics.topAttendees[0].count} sessions`:''} color={T.accent}/>
              </div>

              {/* Revenue by session */}
              <div style={cardStyle}>
                <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>Revenue by Session</div>
                  <button onClick={()=>exportCSV(analytics.revenueBySession.map((s:any)=>({session:s.session.title,date:s.session.date,venue:s.session.venue,tickets:s.tickets,revenue:fmt(s.revenue)})),'tss-revenue-by-session.csv')} style={{padding:'5px 12px',background:T.accentDim,color:T.accent,border:`1px solid ${T.accentBorder}`,borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>📥 Export</button>
                </div>
                {analytics.revenueBySession.map((s:any,i:number)=>{
                  const maxRev=Math.max(...analytics.revenueBySession.map((x:any)=>x.revenue))
                  const pct=Math.round((s.revenue/maxRev)*100)
                  return(
                    <div key={i} style={{padding:'11px 18px',borderBottom:`1px solid #0a140a`,display:'flex',alignItems:'center',gap:12}}>
                      <div style={{minWidth:36}}><div style={{fontWeight:700,fontSize:14,color:T.accent}}>{new Date(s.session.date).getDate()}</div><div style={{fontSize:9,color:T.muted}}>{new Date(s.session.date).toLocaleString('en-GB',{month:'short'})}</div></div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{s.session.title}</div>
                        <div style={{height:4,background:T.border,borderRadius:2}}><div style={{height:'100%',width:`${pct}%`,background:T.accent,borderRadius:2}}/></div>
                      </div>
                      <div style={{textAlign:'right',minWidth:80}}>
                        <div style={{color:T.accent,fontWeight:700}}>{fmt(s.revenue)}</div>
                        <div style={{fontSize:11,color:T.muted}}>{s.tickets} tickets</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Top attendees */}
              <div style={cardStyle}>
                <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>Top Attendees</div>
                  <button onClick={()=>exportCSV(analytics.topAttendees,'tss-top-attendees.csv')} style={{padding:'5px 12px',background:T.accentDim,color:T.accent,border:`1px solid ${T.accentBorder}`,borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>📥 Export</button>
                </div>
                {analytics.topAttendees.slice(0,15).map((a:any,i:number)=>(
                  <div key={i} style={{padding:'10px 18px',borderBottom:`1px solid #0a140a`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:T.accentDim,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:T.accent}}>#{i+1}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:13}}>{a.name}</div>
                        <div style={{fontSize:11,color:T.muted}}>{a.email}</div>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{color:T.accent,fontWeight:600}}>{a.count} session{a.count!==1?'s':''}</div>
                      <div style={{fontSize:12,color:T.muted}}>{fmt(a.spent)} spent</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ):<div style={{textAlign:'center',padding:40,color:T.muted}}>Loading analytics…</div>
        )}

        {/* SETTINGS */}
        {tab==='settings'&&(
          <div style={cardStyle}>
            <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,fontWeight:600,fontSize:12,color:T.muted,textTransform:'uppercase',letterSpacing:1}}>Site Settings</div>
            <div style={{padding:20}}>
              <Field label="About Section — shown on the public booking page">
                <DebouncedTextarea value={settings.about_text??''} onChange={v=>setSettings(s=>({...s,about_text:v}))} rows={4} placeholder="Tell players who The Shuttle Social is…" style={inp({resize:'vertical',lineHeight:1.7})}/>
              </Field>
              <button onClick={()=>saveSetting('about_text',settings.about_text??'')} style={{marginBottom:24,padding:'9px 20px',background:T.accent,color:'#080f08',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>💾 Save About Text</button>

              <Field label="Terms & Conditions — full text shown to players before booking">
                <DebouncedTextarea value={settings.terms_and_conditions??''} onChange={v=>setSettings(s=>({...s,terms_and_conditions:v}))} rows={10} placeholder="Enter your full terms and conditions…" style={inp({resize:'vertical',lineHeight:1.7,fontFamily:'monospace'})}/>
              </Field>
              <button onClick={()=>saveSetting('terms_and_conditions',settings.terms_and_conditions??'')} style={{padding:'9px 20px',background:T.accent,color:'#080f08',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>💾 Save Terms & Conditions</button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Session Editor ────────────────────────────────────────────────────────────
function SessionEditor({session,onSave,onCancel,onStatusChange,onSchedule,onGenerateNext,onDelete,secret,flash,reload}:{session:Session;onSave:(u:any)=>Promise<void>;onCancel:()=>void;onStatusChange:(s:string)=>void;onSchedule:(dt:string)=>void;onGenerateNext:()=>void;onDelete:()=>void;secret:string;flash:(m:string)=>void;reload:()=>void}) {
  const [v,setV]=useState({title:session.title,label:session.label??'West',venue:session.venue,region:session.region,date:session.date,time:session.time,capacity:session.capacity,price_pence:session.price_pence,description:session.description??''})
  const [schedDt,setSchedDt]=useState(session.opens_at?new Date(session.opens_at).toISOString().slice(0,16):'')
  const [saving,setSaving]=useState(false)
  const SC2:Record<string,string>={open:T.accent,draft:T.muted,closed:T.warning,cancelled:T.danger}

  return(
    <div style={{background:T.card,border:`1px solid ${T.accent}`,borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'13px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontWeight:600,fontSize:15}}>{session.title}</div>
          <div style={{fontSize:11,color:T.muted}}>{session.venue} · {session.date}</div>
        </div>
        <button onClick={onCancel} style={{background:'none',border:`1px solid ${T.border}`,color:T.muted,padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>← Back</button>
      </div>
      <div style={{padding:20}}>

        {/* Status + Release */}
        <div style={{marginBottom:20,padding:'14px',background:'#0a140a',borderRadius:10}}>
          <div style={{fontSize:12,color:T.muted,marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>🎯 Ticket Release Control</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:12}}>
            {[['draft','🔒 Keep Hidden'],['open','✅ Open Now'],['closed','🚫 Close'],['cancelled','❌ Cancel']].map(([s,l])=>(
              <button key={s} onClick={()=>onStatusChange(s)} style={{padding:'8px 12px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:session.status===s?`${SC2[s]}18`:'#142014',color:session.status===s?SC2[s]:T.muted,outline:session.status===s?`1px solid ${SC2[s]}44`:'none',fontFamily:'inherit'}}>{l}</button>
            ))}
          </div>
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12}}>
            <div style={{fontSize:12,color:T.info,fontWeight:600,marginBottom:8}}>⏰ Schedule automatic release:</div>
            <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap' as const}}>
              <div style={{flex:1,minWidth:180}}>
                <input type="datetime-local" value={schedDt} onChange={e=>setSchedDt(e.target.value)} style={{...{width:'100%',background:T.card2,border:`1px solid rgba(96,180,255,0.35)`,borderRadius:8,padding:'9px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box' as const,fontFamily:'inherit'}}}/>
              </div>
              <button onClick={()=>schedDt&&onSchedule(schedDt)} disabled={!schedDt} style={{padding:'9px 16px',background:T.infoDim,color:T.info,border:`1px solid rgba(96,180,255,0.3)`,borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:12,whiteSpace:'nowrap' as const,fontFamily:'inherit'}}>⏰ Schedule</button>
              {session.opens_at&&<button onClick={()=>onStatusChange('draft')} style={{padding:'9px 12px',background:'none',color:T.muted,border:`1px solid ${T.border}`,borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Clear</button>}
            </div>
            {session.opens_at&&<div style={{marginTop:8,fontSize:12,color:T.info}}>⏰ Scheduled: {new Date(session.opens_at).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>}
          </div>
        </div>

        {/* Recurring options */}
        {session.is_recurring&&(
          <div style={{marginBottom:20,padding:'12px 14px',background:T.infoDim,border:`1px solid rgba(96,180,255,0.2)`,borderRadius:10}}>
            <div style={{fontSize:13,fontWeight:600,color:T.info,marginBottom:8}}>↻ Recurring Session</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={onGenerateNext} style={{padding:'8px 14px',background:T.infoDim,color:T.info,border:`1px solid rgba(96,180,255,0.3)`,borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit'}}>➕ Create Next Week's Session</button>
              <button onClick={()=>{if(confirm('Cancel just this week?'))reload()}} style={{padding:'8px 14px',background:T.dangerDim,color:T.danger,border:`1px solid rgba(224,85,85,0.3)`,borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit'}}>🚫 Cancel This Week</button>
            </div>
          </div>
        )}

        {/* Edit fields */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
          {[['Label','label','text'],['Title','title','text'],['Venue','venue','text'],['Region','region','text'],['Date','date','date'],['Time','time','time'],['Capacity','capacity','number'],['Price (£)','price_pence','number']].map(([l,k,t])=>(
            <div key={k}>
              <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.5px'}}>{l}</label>
              <DebouncedInput type={t} value={k==='price_pence'?String((v as any)[k]/100):String((v as any)[k])}
                onChange={val=>setV(p=>({...p,[k]:k==='price_pence'?Math.round(Number(val)*100):t==='number'?Number(val):val}))}
                style={{width:'100%',background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:'9px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box' as const,fontFamily:'inherit'}}/>
            </div>
          ))}
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:T.muted,display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.5px'}}>Description</label>
          <DebouncedTextarea value={v.description} onChange={val=>setV(p=>({...p,description:val}))} rows={3} style={{width:'100%',background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:'9px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box' as const,fontFamily:'inherit',resize:'vertical' as const,lineHeight:1.6}}/>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap' as const}}>
          <button onClick={async()=>{setSaving(true);await onSave(v);setSaving(false)}} style={{padding:'11px 26px',background:T.accent,color:'#080f08',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>{saving?'Saving…':'💾 Save Changes'}</button>
          <button onClick={onCancel} style={{padding:'11px 18px',background:'none',color:T.muted,border:`1px solid ${T.border}`,borderRadius:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
          <button onClick={onDelete} style={{marginLeft:'auto',padding:'11px 18px',background:T.dangerDim,color:T.danger,border:`1px solid rgba(224,85,85,0.3)`,borderRadius:10,fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>🗑 Delete Session</button>
        </div>
      </div>
    </div>
  )
}
