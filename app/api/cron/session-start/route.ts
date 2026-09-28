import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ukSessionStartUTC } from '@/lib/time'
import { sendReleaseUnfilled } from '@/lib/email'

function authed(req: Request) {
  return req.headers.get('x-cron-secret') === process.env.CRON_SECRET
}

// Runs periodically. For any release still unfilled once its session has started:
// mark it unfilled, flag the booking, and tell the releaser no refund is due.
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const now = new Date()

  const { data: releases } = await supabaseAdmin
    .from('releases')
    .select('id,booking_id,session_id,spaces,sessions(date,time,title),bookings(email,name,booking_ref)')
    .is('outcome', null)

  let resolved = 0
  for (const r of (releases ?? []) as any[]) {
    const session = r.sessions
    if (!session) continue
    const start = ukSessionStartUTC(session.date, session.time)
    if (start > now) continue   // not started yet

    await supabaseAdmin.from('releases').update({ outcome: 'unfilled', resolved_at: now.toISOString() }).eq('id', r.id)
    await supabaseAdmin.from('bookings').update({ release_status: 'expired_unfilled' }).eq('id', r.booking_id)

    // Expire any lingering offers for this started session.
    await supabaseAdmin.from('waitlist')
      .update({ status: 'expired' }).eq('session_id', r.session_id).eq('status', 'offered')

    const b = r.bookings
    if (b?.email) {
      sendReleaseUnfilled({
        to: b.email, name: b.name ?? 'there', bookingRef: b.booking_ref ?? '',
        sessionTitle: session.title, sessionDate: session.date, spaces: r.spaces,
      }).catch(err => console.error('[cron/session-start] email failed:', err))
    }
    resolved++
  }

  return NextResponse.json({ resolved })
}

export async function GET(req: Request) { return POST(req) }
