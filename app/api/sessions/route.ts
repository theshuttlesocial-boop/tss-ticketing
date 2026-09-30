import { requireAdmin } from '@/lib/staff'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPublicSessions } from '@/lib/sessions/public'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await getPublicSessions()
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { title, label, venue, region, date, time, capacity, price_pence, max_tickets_per_order, status, opens_at, description, is_recurring, recurring_day_of_week, show_coming_soon } = body

  if (!title || !venue || !date || !time) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const row: Record<string, unknown> = {
    title, label: label ?? null, venue, region, date, time,
    capacity: capacity ?? 24, price_pence: price_pence ?? 800,
    max_tickets_per_order: max_tickets_per_order ?? 4,
    status: status ?? 'draft', opens_at: opens_at ?? null,
    description: description ?? null,
    is_recurring: is_recurring ?? false,
    recurring_day_of_week: recurring_day_of_week ?? null,
    show_coming_soon: show_coming_soon === true,
  }
  let { data, error } = await supabaseAdmin.from('sessions').insert(row).select().single()
  // Before migration 023 the column doesn't exist: save without it.
  if (error && error.message.includes('show_coming_soon')) {
    delete row.show_coming_soon
    ;({ data, error } = await supabaseAdmin.from('sessions').insert(row).select().single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const force = searchParams.get('force')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Check for paid bookings — warn before destroying financial records
  const { data: paidBookings } = await supabaseAdmin
    .from('bookings').select('id').eq('session_id', id).eq('stripe_status', 'succeeded')
  if (paidBookings && paidBookings.length > 0 && !force) {
    return NextResponse.json({ error: `This session has ${paidBookings.length} paid booking(s). Delete anyway?`, paid_bookings: paidBookings.length }, { status: 409 })
  }

  // Cascade delete all dependent records in safe order
  await supabaseAdmin.from('session_analytics').delete().eq('session_id', id)
  await supabaseAdmin.from('waitlist').delete().eq('session_id', id)
  await supabaseAdmin.from('seat_holds').delete().eq('session_id', id)
  await supabaseAdmin.from('bookings').delete().eq('session_id', id)

  const { error } = await supabaseAdmin.from('sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
