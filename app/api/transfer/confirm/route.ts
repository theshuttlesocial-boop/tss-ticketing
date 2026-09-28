import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendTransferComplete } from '@/lib/email'

async function loadTransfer(token: string) {
  const { data: transfer } = await supabaseAdmin
    .from('ticket_transfers').select('*').eq('confirm_token', token).maybeSingle()
  if (!transfer) return null
  const { data: booking } = await supabaseAdmin
    .from('bookings').select('id,quantity,session_id,additional_attendees,release_status').eq('id', transfer.booking_id).single()
  const { data: session } = booking
    ? await supabaseAdmin.from('sessions').select('id,title,date,time,venue').eq('id', booking.session_id).single()
    : { data: null }
  return { transfer, booking, session }
}

// GET — the incoming person's confirm page reads the offer details.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const loaded = await loadTransfer(token)
  if (!loaded?.session) return NextResponse.json({ status: 'invalid' })

  const { transfer, session } = loaded
  let status: 'pending' | 'confirmed' | 'expired' = 'pending'
  if (transfer.confirmed_at) status = 'confirmed'
  else if (new Date(transfer.expires_at) < new Date()) status = 'expired'

  return NextResponse.json({
    status,
    fromName: transfer.from_name,
    toName: transfer.to_name,
    session: { title: session.title, date: session.date, time: session.time, venue: session.venue },
  })
}

// POST — the incoming person accepts. Idempotent on confirmed_at.
export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}))
  const loaded = await loadTransfer(token ?? '')
  if (!loaded?.booking || !loaded.session) {
    return NextResponse.json({ error: 'This transfer link is not valid.' }, { status: 404 })
  }
  const { transfer, booking, session } = loaded

  if (transfer.confirmed_at) {
    return NextResponse.json({ success: true, alreadyConfirmed: true })
  }
  if (new Date(transfer.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This transfer link has expired.' }, { status: 410 })
  }

  // One confirmed transfer per booking — block if another already completed.
  const { data: otherConfirmed } = await supabaseAdmin
    .from('ticket_transfers').select('id').eq('booking_id', booking.id)
    .not('confirmed_at', 'is', null).neq('id', transfer.id).limit(1)
  if ((otherConfirmed?.length ?? 0) > 0) {
    return NextResponse.json({ error: 'This ticket has already been transferred.' }, { status: 409 })
  }

  // Update attendee details. Full transfer → the booking becomes the new person.
  // Partial transfer → keep the lead, record the incoming attendee.
  const bookingUpdate: Record<string, any> = { release_status: 'transferred' }
  if (transfer.spaces >= booking.quantity) {
    bookingUpdate.name = transfer.to_name
    bookingUpdate.email = transfer.to_email
    bookingUpdate.phone = transfer.to_phone ?? null
  } else {
    const existing = booking.additional_attendees
      ? (typeof booking.additional_attendees === 'string' ? JSON.parse(booking.additional_attendees) : booking.additional_attendees)
      : []
    existing.push({ name: transfer.to_name, email: transfer.to_email, transferred: true })
    bookingUpdate.additional_attendees = JSON.stringify(existing)
  }

  await supabaseAdmin.from('bookings').update(bookingUpdate).eq('id', booking.id)
  await supabaseAdmin.from('ticket_transfers').update({ confirmed_at: new Date().toISOString() }).eq('id', transfer.id)

  sendTransferComplete({
    fromEmail: transfer.from_email, fromName: transfer.from_name,
    toEmail: transfer.to_email, toName: transfer.to_name,
    sessionTitle: session.title, sessionDate: session.date, sessionTime: session.time, venue: session.venue,
    bookingRef: (await supabaseAdmin.from('bookings').select('booking_ref').eq('id', booking.id).single()).data?.booking_ref ?? '',
  }).catch(err => console.error('[transfer] complete email failed:', err))

  return NextResponse.json({ success: true })
}
