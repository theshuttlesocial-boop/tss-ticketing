import { NextResponse } from 'next/server'
import { lookupReleasableBooking } from '@/lib/release-server'
import { computeRefundQuote } from '@/lib/release'
import { allowReleaseLookup, clientIp } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase'

const GENERIC_ERROR = "We couldn't find that booking. Check the reference and email and try again."

export async function POST(req: Request) {
  const { bookingRef, email } = await req.json().catch(() => ({}))

  // Rate limit: 5 attempts per IP per 15 minutes (booking-ref enumeration guard)
  const ip = clientIp(req)
  const allowed = await allowReleaseLookup(ip, 5, 15)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, { status: 429 })
  }

  const booking = await lookupReleasableBooking(bookingRef ?? '', email ?? '')
  if (!booking) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 })

  if (!booking.sessionInFuture) {
    return NextResponse.json({ error: 'This session has already taken place, so it can no longer be changed.' }, { status: 400 })
  }
  if (booking.maxReleasable < 1) {
    return NextResponse.json({ error: "You've already released all the spots on this booking." }, { status: 400 })
  }

  // Card-refund fee ladder is evaluated at page load from the real price.
  const { data: priorCount } = await supabaseAdmin.rpc('cash_refunds_last_90_days', { p_email: booking.email })
  const priorCardRefunds = priorCount ?? 0

  return NextResponse.json({
    booking: {
      bookingRef: booking.booking_ref,
      name: booking.name,
      quantity: booking.quantity,
      spacesReleased: booking.spaces_released,
      maxReleasable: booking.maxReleasable,
      pricePencePerSpace: booking.pricePencePerSpace,
      hasConfirmedTransfer: booking.hasConfirmedTransfer,
      session: booking.session,
    },
    // Quote for a single space; the page recomputes as the user picks a count.
    priorCardRefunds,
    quotePerSpace: computeRefundQuote(booking.pricePencePerSpace, 1, priorCardRefunds),
  })
}
