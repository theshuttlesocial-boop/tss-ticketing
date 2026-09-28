import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { nanoid } from 'nanoid'
import { getReleasableBookingForEmail, emailForMagicToken } from '@/lib/release-server'
import { sendTransferConfirmRequest } from '@/lib/email'
import { logAudit } from '@/lib/audit'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tickets.theshuttlesocial.com'

// Route A: free name change. Creates a pending ticket_transfers row and emails
// the incoming person a confirm link. No Stripe, no money, no admin fee, ever.
// The transfer only completes when THEY click confirm (see /api/transfer/confirm).
export async function POST(req: Request) {
  const { bookingId, token, spaces, toName, toEmail, toPhone, consent } = await req.json().catch(() => ({}))

  if (consent !== true) {
    return NextResponse.json({ error: 'Please confirm the other person has agreed to take your place.' }, { status: 400 })
  }
  if (!toName?.trim() || !toEmail?.trim()) {
    return NextResponse.json({ error: "Enter the new person's name and email." }, { status: 400 })
  }
  const nSpaces = Number(spaces)
  if (!Number.isInteger(nSpaces) || nSpaces < 1) {
    return NextResponse.json({ error: 'Invalid number of spaces.' }, { status: 400 })
  }

  const email = await emailForMagicToken(token ?? '')
  if (!email) return NextResponse.json({ error: 'Your link has expired. Please request a new one.' }, { status: 401 })

  const booking = await getReleasableBookingForEmail(bookingId ?? '', email)
  if (!booking) return NextResponse.json({ error: "We couldn't find that booking." }, { status: 404 })
  if (!booking.sessionInFuture) {
    return NextResponse.json({ error: 'This session has already taken place.' }, { status: 400 })
  }
  // One confirmed transfer per booking.
  if (booking.hasConfirmedTransfer) {
    return NextResponse.json({ error: 'This ticket has already been transferred once.' }, { status: 409 })
  }
  if (nSpaces > booking.maxReleasable) {
    return NextResponse.json({ error: `You can transfer at most ${booking.maxReleasable} spot(s).` }, { status: 400 })
  }

  // Replace any earlier *pending* (unconfirmed) transfer for this booking.
  await supabaseAdmin.from('ticket_transfers').delete().eq('booking_id', booking.id).is('confirmed_at', null)

  const confirmToken = nanoid(32)
  const { error } = await supabaseAdmin.from('ticket_transfers').insert({
    booking_id: booking.id,
    from_name: booking.name, from_email: booking.email,
    to_name: toName.trim(), to_email: toEmail.trim().toLowerCase(), to_phone: toPhone?.trim() || null,
    spaces: nSpaces, confirm_token: confirmToken,
  })
  if (error) return NextResponse.json({ error: 'Could not start the transfer. Please try again.' }, { status: 500 })

  await logAudit('transfer_requested', { bookingId: booking.id, toEmail: toEmail.trim().toLowerCase(), spaces: nSpaces }, booking.id)

  sendTransferConfirmRequest({
    toEmail: toEmail.trim(), toName: toName.trim(), fromName: booking.name,
    sessionTitle: booking.session.title, sessionDate: booking.session.date,
    sessionTime: booking.session.time, venue: booking.session.venue,
    confirmUrl: `${APP_URL}/transfer/${confirmToken}`,
  }).catch(err => console.error('[transfer] confirm email failed:', err))

  return NextResponse.json({ success: true, toEmail: toEmail.trim() })
}
