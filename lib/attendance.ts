/**
 * Attendance = who is registered in the live session for a booking session.
 * Players add themselves by scanning the QR (name + optional email); owners,
 * admins and session leads can add anyone else. This replaces booking check-in:
 * it counts plus-ones individually and includes people who never booked.
 * Server only.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { publicName } from '@/lib/accounts/history'
import { looksLikeEmail } from '@/lib/waitlist-validate'

export interface Attendee {
  id: string                 // live_session_players.id
  name: string
  email: string | null       // only when the caller may see emails
  booked: boolean | null     // email matches a paid booking for this session; null = no email given
}

export interface Attendance {
  liveSessionIds: string[]
  attendees: Attendee[]
}

/** Normalise an optional email from a form: '' -> null, invalid -> throws. */
export function cleanOptionalEmail(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (!looksLikeEmail(s)) throw new Error("That email address doesn't look right. Please check it, or leave it blank.")
  return s.toLowerCase()
}

/** Remember the email a registered player gave (private table, server only). */
export async function saveLivePlayerEmail(livePlayerId: string, email: string | null, addedBy: string) {
  if (!email) return
  await supabaseAdmin.from('live_player_emails')
    .upsert({ live_player_id: livePlayerId, email: email.toLowerCase(), added_by: addedBy }, { onConflict: 'live_player_id' })
}

/**
 * Attendance for each booking session. withEmails: owners/admins see emails and
 * whether each person booked; session leads see first name + last initial only.
 * Returns null when migration 029 hasn't been run yet.
 */
export async function attendanceFor(ticketSessionIds: string[], withEmails: boolean): Promise<Record<string, Attendance> | null> {
  const out: Record<string, Attendance> = {}
  for (const id of ticketSessionIds) out[id] = { liveSessionIds: [], attendees: [] }
  if (!ticketSessionIds.length) return out

  const { data: live, error } = await supabaseAdmin.from('live_sessions')
    .select('id,ticket_session_id').in('ticket_session_id', ticketSessionIds)
  if (error) return null   // column missing: migration 029 not run
  const liveToTicket = new Map((live ?? []).map((l) => [l.id, l.ticket_session_id as string]))
  for (const l of live ?? []) out[l.ticket_session_id as string].liveSessionIds.push(l.id)
  if (!liveToTicket.size) return out

  const { data: players } = await supabaseAdmin.from('live_session_players')
    .select('id,session_id,name').in('session_id', [...liveToTicket.keys()])
  const ids = (players ?? []).map((p) => p.id)
  const emailOf = new Map<string, string>()
  if (ids.length) {
    const { data: emails } = await supabaseAdmin.from('live_player_emails').select('live_player_id,email').in('live_player_id', ids)
    for (const e of emails ?? []) emailOf.set(e.live_player_id, e.email)
  }

  // Paid booking emails per session, to mark who booked vs. came as a plus-one.
  const bookedEmails = new Map<string, Set<string>>()
  if (withEmails) {
    const { data: bookings } = await supabaseAdmin.from('bookings').select('session_id,email')
      .in('session_id', ticketSessionIds).in('stripe_status', ['succeeded', 'partially_refunded'])
    for (const b of bookings ?? []) {
      if (!bookedEmails.has(b.session_id)) bookedEmails.set(b.session_id, new Set())
      bookedEmails.get(b.session_id)!.add(String(b.email ?? '').trim().toLowerCase())
    }
  }

  for (const p of players ?? []) {
    const ticketId = liveToTicket.get(p.session_id)!
    const email = emailOf.get(p.id) ?? null
    out[ticketId].attendees.push({
      id: p.id,
      name: withEmails ? p.name : publicName(p.name),
      email: withEmails ? email : null,
      booked: withEmails && email ? (bookedEmails.get(ticketId)?.has(email) ?? false) : null,
    })
  }
  for (const a of Object.values(out)) a.attendees.sort((x, y) => x.name.localeCompare(y.name))
  return out
}

/**
 * Called when someone signs in to My portal (their email is proven by the
 * sign-in code). Links any live-session registrations made with that email to
 * their account, so the sessions they attended show in their portal even if
 * someone else booked for them. Never re-links a registration that already
 * belongs to an account, and skips sessions they're already linked to.
 */
export async function claimRegistrationsForAccount(accountId: string, email: string) {
  const e = String(email ?? '').trim().toLowerCase()
  if (!e) return
  const { data: rows, error } = await supabaseAdmin.from('live_player_emails').select('live_player_id').eq('email', e)
  if (error || !rows?.length) return
  const { data: candidates } = await supabaseAdmin.from('live_session_players')
    .select('id,session_id').in('id', rows.map((r) => r.live_player_id)).is('player_id', null)
  if (!candidates?.length) return
  const { data: already } = await supabaseAdmin.from('live_session_players')
    .select('session_id').eq('player_id', accountId).in('session_id', candidates.map((c) => c.session_id))
  const taken = new Set((already ?? []).map((a) => a.session_id))
  const claim: string[] = []
  for (const c of candidates) {
    if (taken.has(c.session_id)) continue
    taken.add(c.session_id)          // at most one registration per session per account
    claim.push(c.id)
  }
  if (claim.length) await supabaseAdmin.from('live_session_players').update({ player_id: accountId }).in('id', claim).is('player_id', null)
}
