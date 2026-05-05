import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function checkAdmin(req: Request) {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
}

export async function GET(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'overview'

  if (type === 'bookings') {
    const sessionId = searchParams.get('session_id')
    let q = supabaseAdmin.from('bookings').select('*,sessions(title,date,time,venue,label)').order('created_at',{ascending:false})
    if (sessionId) q = q.eq('session_id', sessionId)
    else q = q.eq('stripe_status', 'succeeded')
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ bookings: data })
  }

  if (type === 'waitlist') {
    const sessionId = searchParams.get('session_id')
    let q = supabaseAdmin.from('waitlist').select('*,sessions(title,date,venue)').order('position')
    if (sessionId) q = q.eq('session_id', sessionId)
    const { data } = await q
    return NextResponse.json({ waitlist: data ?? [] })
  }

  if (type === 'analytics') {
    const [bookingsRes, sessionsRes, analyticsRes] = await Promise.all([
      supabaseAdmin.from('bookings').select('*').eq('stripe_status','succeeded'),
      supabaseAdmin.from('sessions').select('*').order('date'),
      supabaseAdmin.from('session_analytics').select('session_id,event'),
    ])
    const bookings = bookingsRes.data ?? []
    const sessions = sessionsRes.data ?? []
    const analyticsRows = analyticsRes.data ?? []

    const clicksBySession: Record<string,number> = {}
    const viewsBySession:  Record<string,number> = {}
    analyticsRows.forEach(r => {
      if (r.event === 'book_now_click') clicksBySession[r.session_id] = (clicksBySession[r.session_id]??0)+1
      viewsBySession[r.session_id] = (viewsBySession[r.session_id]??0)+1
    })

    const revenueBySession = sessions.map(s => {
      const sb = bookings.filter(b => b.session_id === s.id)
      return { session: s, bookings: sb, revenue: sb.reduce((a,b)=>a+b.total_pence,0), tickets: sb.reduce((a,b)=>a+b.quantity,0), clicks: clicksBySession[s.id]??0, views: viewsBySession[s.id]??0 }
    }).filter(s => s.tickets > 0 || s.clicks > 0 || s.views > 0)

    const revenueByMonth: Record<string,number> = {}
    bookings.forEach(b => {
      const month = new Date(b.created_at).toLocaleString('en-GB',{month:'short',year:'numeric'})
      revenueByMonth[month] = (revenueByMonth[month] ?? 0) + b.total_pence
    })

    const topAttendees: Record<string,{name:string;email:string;count:number;spent:number}> = {}
    bookings.forEach(b => {
      if (!topAttendees[b.email]) topAttendees[b.email] = { name:b.name, email:b.email, count:0, spent:0 }
      topAttendees[b.email].count += b.quantity
      topAttendees[b.email].spent += b.total_pence
    })

    return NextResponse.json({ revenueBySession, revenueByMonth, topAttendees: Object.values(topAttendees).sort((a,b)=>b.count-a.count).slice(0,20) })
  }

  const [sessionsRes, bookingsRes, settingsRes, waitlistRes] = await Promise.all([
    supabaseAdmin.from('sessions').select('*').order('date'),
    supabaseAdmin.from('bookings').select('*').in('stripe_status',['succeeded','refunded']),
    supabaseAdmin.from('site_settings').select('*'),
    supabaseAdmin.from('waitlist').select('session_id'),
  ])

  const bookings = bookingsRes.data ?? []
  const now = new Date()
  const waitlistCounts: Record<string,number> = {}
  ;(waitlistRes.data ?? []).forEach(w => { waitlistCounts[w.session_id] = (waitlistCounts[w.session_id]??0)+1 })

  const sessions = (sessionsRes.data ?? []).map(s => {
    const sb = bookings.filter(b => b.session_id === s.id && b.stripe_status === 'succeeded')
    const isScheduledOpen = s.opens_at && new Date(s.opens_at) <= now
    return { ...s, booked: sb.reduce((a,b)=>a+b.quantity,0), revenue_pence: sb.reduce((a,b)=>a+b.total_pence,0), effective_status: isScheduledOpen?'open':s.status, waitlist_count: waitlistCounts[s.id]??0 }
  })

  const settings: Record<string,string> = {}
  ;(settingsRes.data ?? []).forEach(s => { settings[s.key] = s.value })

  return NextResponse.json({ sessions, settings, summary: {
    total_bookings: bookings.filter(b=>b.stripe_status==='succeeded').reduce((a,b)=>a+b.quantity,0),
    total_revenue_pence: bookings.filter(b=>b.stripe_status==='succeeded').reduce((a,b)=>a+b.total_pence,0),
    total_refunded_pence: bookings.filter(b=>b.stripe_status==='refunded').reduce((a,b)=>a+b.total_pence,0),
  }})
}

export async function PATCH(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await req.json()

  if (body.setting_key) {
    const { data, error } = await supabaseAdmin.from('site_settings').upsert({ key:body.setting_key, value:body.setting_value, updated_at:new Date().toISOString() }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ setting: data })
  }

  const { session_id, ...rest } = body
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  // Columns guaranteed to exist from the original schema
  const coreFields = ['title','label','venue','region','date','time','capacity','price_pence',
    'description','status','opens_at','is_recurring','recurring_day_of_week','cancelled_occurrence']
  // Optional columns added in migration 002 — may not exist on all deployments yet
  const optionalFields = ['max_tickets_per_order','maps_url']

  // Build full update payload, converting empty strings to null for optional text fields
  const fullUpdate: Record<string,any> = {}
  for (const k of coreFields) { if (k in rest) fullUpdate[k] = rest[k] }
  for (const k of optionalFields) { if (k in rest) fullUpdate[k] = rest[k] === '' ? null : rest[k] }

  const { data, error } = await supabaseAdmin.from('sessions').update(fullUpdate).eq('id', session_id).select().single()

  if (error) {
    // If the error is a missing column in the schema cache, retry with core fields only
    const isSchemaError = error.message.includes('schema cache') || error.message.includes('Could not find')
    if (isSchemaError) {
      const coreUpdate: Record<string,any> = {}
      for (const k of coreFields) { if (k in rest) coreUpdate[k] = rest[k] }
      const { data: d2, error: e2 } = await supabaseAdmin.from('sessions').update(coreUpdate).eq('id', session_id).select().single()
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      return NextResponse.json({ session: d2, warning: 'Saved without optional columns — run migration 002 in Supabase' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ session: data })
}
