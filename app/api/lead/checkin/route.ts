import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { staffFromRequest } from '@/lib/staff'
import { fullySignedIn } from '@/lib/staffRules'
import { canRunTicketSession } from '@/lib/lead'

/** Tick someone in (or undo). Only for a session this staff member may run. */
export async function POST(req: Request) {
  const s = await staffFromRequest(req)
  if (!s || !fullySignedIn(s)) return NextResponse.json({ error: 'Sign in with your staff account' }, { status: 401 })
  const { booking_id, checked_in } = await req.json().catch(() => ({}))
  if (!booking_id || typeof checked_in !== 'boolean') return NextResponse.json({ error: 'booking_id and checked_in required' }, { status: 400 })
  const { data: b } = await supabaseAdmin.from('bookings').select('session_id').eq('id', booking_id).maybeSingle()
  if (!b || !(await canRunTicketSession(s, b.session_id))) return NextResponse.json({ error: 'Not your session' }, { status: 403 })
  const { error } = await supabaseAdmin.from('bookings').update({
    checked_in_at: checked_in ? new Date().toISOString() : null,
    checked_in_by: checked_in ? (s.email ?? 'emergency password') : null,
  }).eq('id', booking_id)
  if (error) return NextResponse.json({ error: error.message.includes('checked_in') ? 'Run migration 020 in Supabase to turn on check-in' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
