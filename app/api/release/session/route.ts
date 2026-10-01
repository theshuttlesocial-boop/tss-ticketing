import { NextResponse } from 'next/server'
import { lookupReleasableBookingsByEmail, releaseEmailFrom } from '@/lib/release-server'
import { computeRefundQuote } from '@/lib/release'
import { supabaseAdmin } from '@/lib/supabase'

// Step 2: the magic link lands here (the token proves inbox ownership), or a player
// signed in to My portal opens /release. Returns the releasable bookings for that email.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const email = await releaseEmailFrom(req, token)
  if (!email) return NextResponse.json({ status: 'invalid' }, { status: 401 })

  const bookings = await lookupReleasableBookingsByEmail(email)
  const { data: priorCount } = await supabaseAdmin.rpc('cash_refunds_last_90_days', { p_email: email })
  const priorCardRefunds = priorCount ?? 0

  return NextResponse.json({
    status: 'ok',
    bookings: bookings.map(b => ({
      id: b.id, bookingRef: b.booking_ref, name: b.name, quantity: b.quantity,
      spacesReleased: b.spaces_released, maxReleasable: b.maxReleasable,
      pricePencePerSpace: b.pricePencePerSpace, hasConfirmedTransfer: b.hasConfirmedTransfer,
      session: b.session,
    })),
    priorCardRefunds,
    quotePerSpace: bookings.length ? computeRefundQuote(bookings[0].pricePencePerSpace, 1, priorCardRefunds) : null,
  })
}
