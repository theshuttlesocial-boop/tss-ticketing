import { supabaseAdmin } from '@/lib/supabase'
import { nanoid } from 'nanoid'
import { ukSessionStartUTC } from '@/lib/time'
import { userFromRequest } from '@/lib/account'

/** Releases and transfers close this long before a session starts. */
export const RELEASE_CUTOFF_MINUTES = 15

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

// Still time to release: up to RELEASE_CUTOFF_MINUTES before the start (UK time).
export function releaseStillOpen(session: { date: string; time: string }, now = new Date()): boolean {
  return now.getTime() < ukSessionStartUTC(session.date, session.time).getTime() - RELEASE_CUTOFF_MINUTES * 60_000
}

function buildShape(booking: any, session: any, hasConfirmedTransfer: boolean): ReleasableBooking {
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
    sessionInFuture: releaseStillOpen(session),
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

// ── Magic-link tokens ────────────────────────────────────────────────────────
// A token proves the person controls the email inbox. Valid for 30 min (the DB
// default), reusable within that window so the page can read then act.
export async function createReleaseMagicToken(emailRaw: string): Promise<string> {
  const token = nanoid(40)
  await supabaseAdmin.from('release_magic_links').insert({ email: (emailRaw ?? '').trim().toLowerCase(), token })
  return token
}

export async function emailForMagicToken(token: string): Promise<string | null> {
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('release_magic_links').select('email,expires_at').eq('token', token).maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at) < new Date()) return null
  return data.email
}

/**
 * Who is managing their booking: the emailed link (any visitor), or a player signed in
 * to My portal (Bearer token), so signed-in players don't need the email step.
 */
export async function releaseEmailFrom(req: Request, token?: string | null): Promise<string | null> {
  const fromLink = await emailForMagicToken(token ?? '')
  if (fromLink) return fromLink
  const u = await userFromRequest(req)
  return u?.email ? u.email.trim().toLowerCase() : null
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
