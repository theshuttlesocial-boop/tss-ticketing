import { supabaseAdmin } from '@/lib/supabase'

export interface ReleasableBooking {
  id: string
  booking_ref: string
  name: string
  email: string
  phone: string | null
  quantity: number
  spaces_released: number
  release_status: string
  total_pence: number
  stripe_payment_intent_id: string | null
  pricePencePerSpace: number
  maxReleasable: number
  sessionInFuture: boolean
  hasConfirmedTransfer: boolean
  session: { id: string; title: string; date: string; time: string; venue: string; label?: string }
}

// Case-insensitive match on BOTH booking ref and email. Returns null whenever
// anything doesn't line up — callers must surface a single generic error and
// never reveal which field was wrong (prevents booking-ref enumeration).
//
// booking_ref is stored upper-cased at creation, so we upper-case the input and
// exact-match it (safe against LIKE/ILIKE wildcard chars such as `_` that the
// nanoid alphabet can contain). Email is compared case-insensitively in JS.
export async function lookupReleasableBooking(bookingRefRaw: string, emailRaw: string): Promise<ReleasableBooking | null> {
  const bookingRef = (bookingRefRaw ?? '').trim().toUpperCase()
  const email = (emailRaw ?? '').trim().toLowerCase()
  if (!bookingRef || !email) return null

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id,booking_ref,name,email,phone,quantity,spaces_released,release_status,total_pence,stripe_payment_intent_id,session_id')
    .eq('booking_ref', bookingRef)
    .maybeSingle()

  if (!booking) return null
  if ((booking.email ?? '').trim().toLowerCase() !== email) return null
  // Only paid bookings can be released (covers 'succeeded' and, later, 'partially_refunded').
  // Read stripe_status separately to keep the select above tight.
  const { data: statusRow } = await supabaseAdmin
    .from('bookings').select('stripe_status').eq('id', booking.id).single()
  const paid = statusRow?.stripe_status === 'succeeded' || statusRow?.stripe_status === 'partially_refunded'
  if (!paid) return null

  const { data: session } = await supabaseAdmin
    .from('sessions').select('id,title,date,time,venue,label').eq('id', booking.session_id).single()
  if (!session) return null

  const { data: confirmedTransfers } = await supabaseAdmin
    .from('ticket_transfers').select('id').eq('booking_id', booking.id).not('confirmed_at', 'is', null).limit(1)

  const today = new Date().toISOString().split('T')[0]
  const spacesReleased = booking.spaces_released ?? 0

  return {
    id: booking.id,
    booking_ref: booking.booking_ref,
    name: booking.name,
    email: booking.email,
    phone: booking.phone ?? null,
    quantity: booking.quantity,
    spaces_released: spacesReleased,
    release_status: booking.release_status ?? 'none',
    total_pence: booking.total_pence,
    stripe_payment_intent_id: booking.stripe_payment_intent_id ?? null,
    pricePencePerSpace: Math.round(booking.total_pence / booking.quantity),
    maxReleasable: booking.quantity - spacesReleased,
    sessionInFuture: session.date >= today,
    hasConfirmedTransfer: (confirmedTransfers?.length ?? 0) > 0,
    session: {
      id: session.id, title: session.title, date: session.date,
      time: session.time, venue: session.venue, label: session.label ?? undefined,
    },
  }
}
