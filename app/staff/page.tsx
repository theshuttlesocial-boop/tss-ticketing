'use client'
import { useCallback, useEffect, useState } from 'react'
import { T, btn, inp, cardStyle } from '../live/_components/theme'
import { staffHeaders, whoAmI } from '@/lib/staffClient'

type Member = { id: string; email: string; role: 'owner' | 'admin' | 'session_lead'; active: boolean; created_at: string; revoked_at: string | null
  assignments: { id: string; label: string; valid_from: string | null; valid_to: string | null; live: boolean }[] }
type Data = { staff: Member[]; upcoming: { id: string; title: string; venue: string; date: string; time: string }[]
  live: { id: string; name: string; status: string }[]
  audit: { at: string; source: 'site' | 'live'; event: string; who: string | null; detail: any; entity?: string }[] }

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', session_lead: 'Session lead' }
const wrap: React.CSSProperties = { minHeight:'100vh', background:T.bg, color:T.text, padding:'20px 16px 48px',
  fontFamily:'DM Sans, system-ui, sans-serif', boxSizing:'border-box', maxWidth:680, margin:'0 auto' }
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''

/** One plain line per audit entry. */
function auditLine(a: Data['audit'][number]) {
  const d = a.detail ?? {}
  switch (a.event) {
    case 'staff_invited': return `Added ${d.email} as ${ROLE[d.role] ?? d.role}`
    case 'staff_role_changed': return `${d.email}: ${ROLE[d.from]} → ${ROLE[d.to]}`
    case 'staff_revoked': return `Removed access for ${d.email}`
    case 'staff_restored': return `Restored access for ${d.email}`
    case 'lead_assigned': return `${d.email} leads ${d.session}`
    case 'lead_unassigned': return `${d.email} no longer leads a session`
  }
  if (a.source === 'live') {
    const where = [d.session, d.round ? `R${d.round}` : '', d.court ? `C${d.court}` : ''].filter(Boolean).join(' ')
    return `${where} · ${a.event.replace(/_/g, ' ')}${d.name ? ` · ${d.name}` : ''}${d.from && d.to ? ` · ${d.from} → ${d.to}` : ''}`
  }
  return `${a.event.replace(/_/g, ' ')}${a.entity ? ` · ${a.entity}` : ''}`
}

/**
 * Owner-only Staff page (Roadmap Phase 5c): invite people, set their role,
 * assign session leads to sessions, remove access instantly, and read the
 * audit log. The server enforces all of it (lib/staffAdmin.ts).
 */
export default function StaffPage() {
  const [me, setMe] = useState<{ email: string | null; role: string; via: string } | null | undefined>(undefined)
  const [data, setData] = useState<Data | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState(''); const [role, setRole] = useState<Member['role']>('session_lead'); const [send, setSend] = useState(true)
  const [tab, setTab] = useState<'team' | 'audit'>('team')

  const load = useCallback(async () => {
    const res = await fetch('/api/staff', { cache:'no-store', headers: staffHeaders() })
    if (res.ok) setData(await res.json())
  }, [])
  useEffect(() => { whoAmI().then((w) => { setMe(w); if (w?.role === 'owner') load() }) }, [load])

  const call = async (path: string, method: string, body?: unknown, done?: string) => {
    setBusy(true); setMsg(null)
    const res = await fetch(path, { method, headers: { 'Content-Type':'application/json', ...staffHeaders() }, body: body ? JSON.stringify(body) : undefined })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: j.error ?? 'Something went wrong' }); return false }
    if (done) setMsg({ ok: true, text: done })
    await load(); return true
  }

  if (me === undefined) return <div style={{ ...wrap, color:T.muted }}>Loading…</div>
  if (!me || me.role !== 'owner') return (
    <div style={{ ...wrap, textAlign:'center', paddingTop:80 }}>
      <h1 style={{ fontSize:22, fontWeight:900 }}>Owners only</h1>
      <p style={{ color:T.muted }}>{me ? 'Your account can’t manage staff.' : 'Sign in with an owner account.'}</p>
      {!me && <a href="/account?next=/staff" style={{ ...btn('primary'), display:'inline-block', padding:'12px 20px', textDecoration:'none' }}>Sign in</a>}
    </div>
  )

  return (
    <div style={wrap}>
      <a href="/admin" style={{ color:T.muted, fontSize:14, textDecoration:'none' }}>← Admin</a>
      <h1 style={{ fontSize:28, fontWeight:900, margin:'10px 0 4px' }}>Staff</h1>
      <p style={{ color:T.muted, fontSize:13, margin:'0 0 14px' }}>
        Owners manage everything. Admins run bookings and sessions. Session leads only see the sessions you give them, on the day.
      </p>
      {me.via !== 'account' && <div style={{ color:T.warning, marginBottom:12, fontSize:14 }}>You’re using the emergency password. Sign in with your owner account to make changes.</div>}
      {msg && <div role="status" style={{ background: msg.ok ? T.accentDim : T.dangerDim, border:`1px solid ${msg.ok ? T.accentBorder : T.danger}`,
        color: msg.ok ? T.accent : T.danger, padding:'10px 12px', borderRadius:8, marginBottom:12, fontSize:14 }}>{msg.text}</div>}

      <div role="tablist" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
        {(['team', 'audit'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ ...btn(tab === t ? 'primary' : 'ghost'), minHeight:44 }}>
            {t === 'team' ? 'Team' : 'Audit log'}
          </button>
        ))}
      </div>

      {tab === 'team' && data && <>
        <section style={{ ...cardStyle, padding:14 }}>
          <h2 style={{ fontSize:15, margin:'0 0 10px' }}>Add someone</h2>
          <input aria-label="Email" type="email" placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
            style={inp({ fontSize:16, marginBottom:8 })} />
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Member['role'])} style={inp({ fontSize:16, marginBottom:8 })}>
            <option value="session_lead">Session lead — runs the sessions you assign, on the day</option>
            <option value="admin">Admin — bookings, refunds, sessions, everything but staff</option>
            <option value="owner">Owner — everything, including staff</option>
          </select>
          <label style={{ display:'flex', gap:8, alignItems:'center', fontSize:14, marginBottom:10 }}>
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} style={{ width:20, height:20 }} /> Email them a sign-in link
          </label>
          <button style={{ ...btn('primary'), width:'100%', minHeight:48 }} disabled={busy || !email.includes('@')}
            onClick={async () => { if (await call('/api/staff', 'POST', { email, role, sendEmail: send }, `${email} added as ${ROLE[role]}`)) setEmail('') }}>Add</button>
        </section>

        {data.staff.map((m) => <MemberCard key={m.id} m={m} data={data} busy={busy} self={m.email.toLowerCase() === me.email?.toLowerCase()} call={call} />)}
      </>}

      {tab === 'audit' && data && (
        <section style={{ ...cardStyle, padding:14 }}>
          <p style={{ color:T.muted, fontSize:12, margin:'0 0 10px' }}>Staff changes, bookings money events and live-session changes, newest first.</p>
          <div style={{ display:'grid', gap:5 }}>
            {data.audit.map((a, i) => (
              <div key={i} style={{ background:T.card2, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 10px', fontSize:13 }}>
                <div>{auditLine(a)}</div>
                <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>{when(a.at)}{a.who ? ` · ${a.who}` : ''}</div>
              </div>
            ))}
            {data.audit.length === 0 && <div style={{ color:T.muted }}>Nothing yet.</div>}
          </div>
        </section>
      )}
    </div>
  )
}

function MemberCard({ m, data, busy, self, call }: { m: Member; data: Data; busy: boolean; self: boolean
  call: (path: string, method: string, body?: unknown, done?: string) => Promise<boolean> }) {
  const [pick, setPick] = useState('')
  return (
    <section style={{ ...cardStyle, padding:14, opacity: m.active ? 1 : 0.6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontWeight:800, wordBreak:'break-all' }}>{m.email}{self ? ' (you)' : ''}</div>
          <div style={{ fontSize:12, color: m.active ? T.muted : T.danger }}>{m.active ? ROLE[m.role] : `Access removed ${when(m.revoked_at)}`}</div>
        </div>
        {m.active
          ? <button style={{ ...btn('danger'), minHeight:40, flexShrink:0 }} disabled={busy}
              onClick={() => { if (confirm(`Remove ${m.email}'s access now? They're locked out on their next click.`)) call('/api/staff', 'PATCH', { id: m.id, active: false }, `Access removed for ${m.email}`) }}>Remove</button>
          : <button style={{ ...btn(), minHeight:40, flexShrink:0 }} disabled={busy}
              onClick={() => call('/api/staff', 'PATCH', { id: m.id, active: true }, `Access restored for ${m.email}`)}>Restore</button>}
      </div>
      {m.active && (
        <select aria-label={`Role for ${m.email}`} value={m.role} disabled={busy} style={inp({ fontSize:15, marginBottom:8 })}
          onChange={(e) => { const r = e.target.value; if (confirm(`Make ${m.email} ${ROLE[r]}?`)) call('/api/staff', 'PATCH', { id: m.id, role: r }, `${m.email} is now ${ROLE[r]}`) }}>
          {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      {m.active && m.role === 'session_lead' && (
        <div>
          <div style={{ fontSize:12, color:T.muted, margin:'4px 0 6px' }}>Sessions they lead (from 3 h before start to 6 h after)</div>
          {m.assignments.map((a) => (
            <div key={a.id} style={{ display:'flex', gap:8, alignItems:'center', fontSize:13, padding:'6px 0', borderTop:`1px solid ${T.border}` }}>
              <span style={{ flex:1 }}>{a.label}<span style={{ display:'block', color:T.muted, fontSize:11 }}>{when(a.valid_from)} – {when(a.valid_to)}</span></span>
              <button style={{ ...btn(), padding:'6px 10px', fontSize:12 }} disabled={busy}
                onClick={() => call(`/api/staff/assign?id=${a.id}`, 'DELETE', undefined, 'Unassigned')}>Unassign</button>
            </div>
          ))}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginTop:8 }}>
            <select aria-label="Assign a session" value={pick} onChange={(e) => setPick(e.target.value)} style={inp({ fontSize:15 })}>
              <option value="">Assign a session…</option>
              <optgroup label="Booking sessions">
                {data.upcoming.map((s) => <option key={s.id} value={`t:${s.id}`}>{s.date} {s.time} · {s.title}</option>)}
              </optgroup>
              {data.live.filter((l) => l.status !== 'finished').length > 0 && (
                <optgroup label="Live sessions running now">
                  {data.live.filter((l) => l.status !== 'finished').map((l) => <option key={l.id} value={`l:${l.id}`}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
            <button style={{ ...btn('primary'), minHeight:44 }} disabled={busy || !pick}
              onClick={async () => {
                const [k, id] = pick.split(':')
                if (await call('/api/staff/assign', 'POST', { staff_id: m.id, ...(k === 't' ? { ticket_session_id: id } : { live_session_id: id }) }, 'Assigned')) setPick('')
              }}>Assign</button>
          </div>
        </div>
      )}
    </section>
  )
}
