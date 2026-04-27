import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [sessionsRes, settingsRes] = await Promise.all([
    supabaseAdmin.from('sessions').select('*').in('status', ['open','draft']).eq('cancelled_occurrence', false).order('date', { ascending: true }),
    supabaseAdmin.from('site_settings').select('*')
  ])

  if (sessionsRes.error) return NextResponse.json({ error: sessionsRes.error.message }, { status: 500 })

  const now = new Date()
  const settings: Record<string,string> = {}
  ;(settingsRes.data ?? []).forEach(s => { settings[s.key] = s.value })

  const enriched = await Promise.all(
    (sessionsRes.data ?? []).map(async (session) => {
      const isScheduledOpen = session.opens_at && new Date(session.opens_at) <= now
      const effectiveStatus = isScheduledOpen ? 'open' : session.status
      if (effectiveStatus === 'draft') return null

      const [bookingRes, holdRes] = await Promise.all([
        supabaseAdmin.from('bookings').select('quantity').eq('session_id', session.id).eq('stripe_status', 'succeeded'),
        supabaseAdmin.from('seat_holds').select('quantity').eq('session_id', session.id).eq('used', false).gt('expires_at', now.toISOString()),
      ])

      const booked = (bookingRes.data ?? []).reduce((s,b) => s+b.quantity, 0)
      const held   = (holdRes.data ?? []).reduce((s,h) => s+h.quantity, 0)

      return { ...session, status: effectiveStatus, booked, held, available: session.capacity - booked - held }
    })
  )

  return NextResponse.json({ sessions: enriched.filter(Boolean), settings })
}

export async function POST(req: Request) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { title, label, venue, region, date, time, capacity, price_pence, max_tickets_per_order, status, opens_at, description, is_recurring, recurring_day_of_week } = body

  if (!title || !venue || !date || !time) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('sessions').insert({
    title, label: label ?? null, venue, region, date, time,
    capacity: capacity ?? 24, price_pence: price_pence ?? 800,
    max_tickets_per_order: max_tickets_per_order ?? 4,
    status: status ?? 'draft', opens_at: opens_at ?? null,
    description: description ?? null,
    is_recurring: is_recurring ?? false,
    recurring_day_of_week: recurring_day_of_week ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}

export async function DELETE(req: Request) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
