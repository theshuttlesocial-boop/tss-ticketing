import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function checkAdmin(req: Request) {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
}

// GET — name-change transfers, newest first, with a computed status.
export async function GET(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('ticket_transfers')
    .select('id,from_name,from_email,to_name,to_email,to_phone,spaces,requested_at,confirmed_at,expires_at,bookings(booking_ref,sessions(title,date))')
    .order('requested_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const transfers = (data ?? []).map((t: any) => ({
    ...t,
    status: t.confirmed_at ? 'confirmed' : (new Date(t.expires_at) < now ? 'expired' : 'pending'),
  }))
  return NextResponse.json({ transfers })
}
