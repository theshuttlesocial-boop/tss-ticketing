import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Creates next week's occurrence of a recurring session
export async function POST(req: Request) {
  const adminSecret = req.headers.get('x-admin-secret')
  if (adminSecret !== process.env.ADMIN_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { parent_id } = await req.json()

  const { data: parent, error } = await supabaseAdmin.from('sessions').select('*').eq('id', parent_id).single()
  if (error || !parent) return NextResponse.json({ error: 'Parent session not found' }, { status: 404 })

  // Calculate next occurrence date (add 7 days)
  const nextDate = new Date(parent.date)
  nextDate.setDate(nextDate.getDate() + 7)

  const { data: newSession, error: createError } = await supabaseAdmin.from('sessions').insert({
    title: parent.title,
    label: parent.label,
    venue: parent.venue,
    region: parent.region,
    date: nextDate.toISOString().split('T')[0],
    time: parent.time,
    capacity: parent.capacity,
    price_pence: parent.price_pence,
    description: parent.description,
    status: 'draft', // always start as draft for safety
    is_recurring: true,
    recurring_day_of_week: parent.recurring_day_of_week,
    recurring_parent_id: parent.id,
  }).select().single()

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
  return NextResponse.json({ session: newSession })
}

// Auto-generate upcoming sessions for all recurring sessions
export async function GET(req: Request) {
  const adminSecret = req.headers.get('x-admin-secret')
  if (adminSecret !== process.env.ADMIN_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Find recurring sessions that don't have a next occurrence scheduled
  const { data: recurringSessions } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('is_recurring', true)
    .is('recurring_parent_id', null) // only top-level recurring sessions
    .order('date', { ascending: false })

  const created = []
  const now = new Date()

  for (const session of recurringSessions ?? []) {
    const sessionDate = new Date(session.date)
    const daysDiff = (now.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24)

    // If session is more than 6 days old and no future occurrence exists
    if (daysDiff > 6) {
      const nextDate = new Date(sessionDate)
      nextDate.setDate(nextDate.getDate() + 7)
      const nextDateStr = nextDate.toISOString().split('T')[0]

      const { data: existing } = await supabaseAdmin.from('sessions').select('id').eq('recurring_parent_id', session.id).eq('date', nextDateStr).single()
      if (!existing) {
        const { data: newS } = await supabaseAdmin.from('sessions').insert({
          title: session.title, label: session.label, venue: session.venue, region: session.region,
          date: nextDateStr, time: session.time, capacity: session.capacity, price_pence: session.price_pence,
          description: session.description, status: 'draft', is_recurring: true,
          recurring_day_of_week: session.recurring_day_of_week, recurring_parent_id: session.id,
        }).select().single()
        if (newS) created.push(newS)
      }
    }
  }

  return NextResponse.json({ created, count: created.length })
}
