import { NextResponse } from 'next/server'
import { lookupReleasableBookingsByEmail } from '@/lib/release-server'
import { computeRefundQuote } from '@/lib/release'
import { allowReleaseLookup, clientIp } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase'

const GENERIC_ERROR = "We couldn't find an upcoming booking for that email. Check the address and try again."

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}))

  // Rate limit: 5 attempts per IP per 15 minutes (email enumeration / abuse guard)
  const ip = clientIp(req)
  const allowed = await allowReleaseLookup(ip, 5, 15)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, { status: 429 })
  }

  if (!email?.trim()) return NextResponse.json({ error: 'Enter your email.' }, { status: 400 })

  const bookings = await lookupReleasableBookingsByEmail(email)
  if (!bookings.length) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 })

  // Card-refund fee ladder is per-email, evaluated from the real price at load.
  const { data: priorCount } = await supabaseAdmin.rpc('cash_refunds_last_90_days', { p_email: bookings[0].email })
  const priorCardRefunds = priorCount ?? 0

  return NextResponse.json({
    // Newest first. The page auto-selects when there is only one.
    bookings: bookings.map(b => ({
      id: b.id,
      bookingRef: b.booking_ref,
      name: b.name,
      quantity: b.quantity,
      spacesReleased: b.spaces_released,
      maxReleasable: b.maxReleasable,
      pricePencePerSpace: b.pricePencePerSpace,
      hasConfirmedTransfer: b.hasConfirmedTransfer,
      session: b.session,
    })),
    priorCardRefunds,
    quotePerSpace: computeRefundQuote(bookings[0].pricePencePerSpace, 1, priorCardRefunds),
  })
}
