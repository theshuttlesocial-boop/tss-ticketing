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

const BOOKING_COLS =
  'id,booking_ref,name,email,phone,quantity,spaces_released,release_status,total_pence,stripe_payment_intent_id,stripe_status,session_id,created_at,sessions(id,title,date,time,venue,label)'

function isPaid(status?: string) {
  return status === 'succeeded' || status === 'partially_refunded'
}

function buildShape(booking: any, session: any, hasConfirmedTransfer: boolean): ReleasableBooking {
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
    hasConfirmedTransfer,
    session: {
      id: session.id, title: session.title, date: session.date,
      time: session.time, venue: session.venue, label: session.label ?? undefined,
    },
  }
}

// Case-insensitive email match. PostgREST ilike can over-match (email local
// parts may contain `_`/`%`, which are LIKE wildcards), so we tighten with an
// exact lower-cased comparison in JS — over-matching only ever returns extra
// rows we then discard, never fewer.
async function confirmedTransferIds(bookingIds: string[]): Promise<Set<string>> {
  const set = new Set<string>()
  if (!bookingIds.length) return set
  const { data } = await supabaseAdmin
    .from('ticket_transfers').select('booking_id').not('confirmed_at', 'is', null).in('booking_id', bookingIds)
  ;(data ?? []).forEach((t: any) => set.add(t.booking_id))
  return set
}

// All releasable bookings for an email: paid, future-dated, with spaces left to
// release, newest first. Empty array when the email has none.
export async function lookupReleasableBookingsByEmail(emailRaw: string): Promise<ReleasableBooking[]> {
  const email = (emailRaw ?? '').trim().toLowerCase()
  if (!email) return []

  const { data } = await supabaseAdmin
    .from('bookings')
    .select(BOOKING_COLS)
    .ilike('email', email)
    .in('stripe_status', ['succeeded', 'partially_refunded'])
    .order('created_at', { ascending: false })

  const rows = (data ?? []).filter((b: any) => (b.email ?? '').trim().toLowerCase() === email && b.sessions)
  const confirmed = await confirmedTransferIds(rows.map((r: any) => r.id))

  return rows
    .map((b: any) => buildShape(b, b.sessions, confirmed.has(b.id)))
    .filter(b => b.sessionInFuture && b.maxReleasable >= 1)
}

// Re-validate a specific booking belongs to the email, for the POST endpoints.
// Never trust a client-supplied booking id on its own.
export async function getReleasableBookingForEmail(bookingId: string, emailRaw: string): Promise<ReleasableBooking | null> {
  const email = (emailRaw ?? '').trim().toLowerCase()
  if (!bookingId || !email) return null

  const { data: b } = await supabaseAdmin.from('bookings').select(BOOKING_COLS).eq('id', bookingId).maybeSingle()
  if (!b || !(b as any).sessions) return null
  if (((b as any).email ?? '').trim().toLowerCase() !== email) return null
  if (!isPaid((b as any).stripe_status)) return null

  const { data: t } = await supabaseAdmin
    .from('ticket_transfers').select('id').eq('booking_id', (b as any).id).not('confirmed_at', 'is', null).limit(1)
  return buildShape(b, (b as any).sessions, (t?.length ?? 0) > 0)
}
