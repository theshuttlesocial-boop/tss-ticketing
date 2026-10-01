import { supabaseAdmin } from '@/lib/supabase'
import { nanoid } from 'nanoid'
import { selectQueueOffers, selectSameDayOffers, isSessionDayLondon, QUEUE_OFFER_MINUTES, isTierWindowActive, hasLiveOfferConflict, MatchCandidate } from '@/lib/waitlist-alloc'
import { ukSessionStartUTC } from '@/lib/time'
import { notify } from '@/lib/notify'
import { logAudit } from '@/lib/audit'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tickets.theshuttlesocial.com'

// Open spots = capacity − net confirmed bookings − active unexpired holds.
// "Net" means released spaces (bookings.spaces_released) count as available.
export async function openSpotsFor(sessionId: string): Promise<number> {
  const nowIso = new Date().toISOString()
  const [sessionRes, bookingsRes, holdsRes] = await Promise.all([
    supabaseAdmin.from('sessions').select('capacity').eq('id', sessionId).single(),
    supabaseAdmin.from('bookings').select('quantity,spaces_released').eq('session_id', sessionId).in('stripe_status', ['succeeded','partially_refunded']),
    supabaseAdmin.from('seat_holds').select('quantity').eq('session_id', sessionId).eq('used', false).gt('expires_at', nowIso),
  ])
  const capacity = sessionRes.data?.capacity ?? 0
  const booked = (bookingsRes.data ?? []).reduce((a, b) => a + (b.quantity - (b.spaces_released ?? 0)), 0)
  const held = (holdsRes.data ?? []).reduce((a, h) => a + h.quantity, 0)
  return capacity - booked - held
}

// Spaces promised to people holding a live waitlist offer for this session. While an
// offer is live those spaces are kept off public sale (claim_seat_hold, migration 028).
export async function liveOfferedSpaces(sessionId: string): Promise<number> {
  const { data } = await supabaseAdmin.from('waitlist').select('claim_spaces')
    .eq('session_id', sessionId).eq('status', 'offered').gt('claim_expires_at', new Date().toISOString())
  return (data ?? []).reduce((a, r) => a + (r.claim_spaces ?? 0), 0)
}

// Offer freed spaces to the waitlist. Safe to re-run (the cron calls it every 2 min).
//  - Day before or earlier: one person per free space, in waitlist order, held for them
//    for QUEUE_OFFER_MINUTES; spaces already held by live offers aren't offered again.
//  - On the day: everyone waiting is offered at once until the session starts, and the
//    first to pay gets it (filling the session comes first).
// opts.everyone: admin "release to everyone" — the session-day rules, whatever the date.
export async function runCascade(sessionId: string, opts?: { ignoreTier?: boolean; everyone?: boolean }): Promise<{ openSpots: number; offered: number }> {
  const now = new Date()
  const nowIso = now.toISOString()

  // 2. Expire offers whose claim window has passed.
  await supabaseAdmin.from('waitlist')
    .update({ status: 'expired' })
    .eq('session_id', sessionId).eq('status', 'offered').lt('claim_expires_at', nowIso)

  // 1. Return early if nothing is open.
  const openSpots = await openSpotsFor(sessionId)
  if (openSpots <= 0) return { openSpots, offered: 0 }

  const { data: session } = await supabaseAdmin
    .from('sessions').select('id,title,date,time,venue').eq('id', sessionId).single()
  if (!session) return { openSpots, offered: 0 }
  const sameDay = !!opts?.everyone || isSessionDayLondon(session.date, now)
  const startsAt = ukSessionStartUTC(session.date, session.time)
  if (startsAt <= now) return { openSpots, offered: 0 }
  // One at a time: only spaces not already held for someone can be offered.
  const freeSpots = sameDay ? openSpots : openSpots - await liveOfferedSpaces(sessionId)
  if (freeSpots <= 0) return { openSpots, offered: 0 }

  // 3. Tier window, anchored on the most recent unresolved release.
  const { data: releases } = await supabaseAdmin
    .from('releases').select('released_at').eq('session_id', sessionId).is('resolved_at', null)
    .order('released_at', { ascending: false }).limit(1)
  const windowActive = opts?.ignoreTier
    ? false
    : (releases?.length ?? 0) > 0
      ? isTierWindowActive(session.date, new Date(releases![0].released_at), now)
      : false

  // 4. Candidates: this session's waiting rows.
  const { data: waitingRows } = await supabaseAdmin
    .from('waitlist')
    .select('id,email,phone,name,waitlist_group_id,position,preference_rank,spaces_needed,min_spaces_acceptable,times_offered')
    .eq('session_id', sessionId).eq('status', 'waiting')
    .order('position', { ascending: true })
  let waiting = waitingRows ?? []
  if (!waiting.length) return { openSpots, offered: 0 }

  // Exclusion (a): anyone who already holds a LIVE offer on ANY session,
  // matched by email and by waitlist_group_id.
  const { data: liveOffers } = await supabaseAdmin
    .from('waitlist').select('email,waitlist_group_id').eq('status', 'offered').gt('claim_expires_at', nowIso)
  const liveEmails = new Set((liveOffers ?? []).map(o => (o.email ?? '').toLowerCase()))
  const liveGroups = new Set((liveOffers ?? []).map(o => o.waitlist_group_id).filter(Boolean) as string[])
  waiting = waiting.filter(w => !hasLiveOfferConflict({ email: w.email ?? '', groupId: w.waitlist_group_id ?? null }, liveEmails, liveGroups))

  // Exclusion (b): anyone whose higher-ranked preference session currently has
  // availability — they should be offered that one first.
  waiting = await filterHigherPreferenceAvailable(waiting)
  if (!waiting.length) return { openSpots, offered: 0 }

  // Resolve prior_session_count per unique email (0 == new player).
  const priorByEmail = new Map<string, number>()
  await Promise.all([...new Set(waiting.map(w => w.email))].map(async email => {
    const { data } = await supabaseAdmin.rpc('prior_session_count', { p_email: email })
    priorByEmail.set(email, data ?? 0)
  }))

  const candidates: MatchCandidate[] = waiting.map(w => ({
    id: w.id, email: w.email, groupId: w.waitlist_group_id ?? null,
    position: w.position ?? 0, preferenceRank: w.preference_rank ?? 1,
    spacesNeeded: w.spaces_needed ?? 1, minSpaces: w.min_spaces_acceptable ?? 1,
    priorSessionCount: priorByEmail.get(w.email) ?? 0,
  }))

  const offers = sameDay ? selectSameDayOffers(candidates, openSpots) : selectQueueOffers(candidates, freeSpots, windowActive)
  if (!offers.length) return { openSpots, offered: 0 }

  // Claim window: one-at-a-time offers are held for 20 minutes; on the day the offer
  // stays open until the session starts (first to pay wins).
  const expires = sameDay ? startsAt : new Date(Math.min(now.getTime() + QUEUE_OFFER_MINUTES * 60_000, startsAt.getTime()))
  const claimExpiresAt = expires.toISOString()
  const claimMinutes = Math.max(1, Math.round((expires.getTime() - now.getTime()) / 60_000))

  const rowById = new Map(waiting.map(w => [w.id, w]))
  for (const offer of offers) {
    const row = rowById.get(offer.id)
    if (!row) continue
    const token = nanoid(32)
    await supabaseAdmin.from('waitlist').update({
      status: 'offered',
      claim_token: token,
      claim_spaces: offer.claimSpaces,
      claim_expires_at: claimExpiresAt,
      times_offered: (row.times_offered ?? 0) + 1,
      last_offered_at: nowIso,
    }).eq('id', offer.id)

    logAudit('offer', { email: row.email, sessionId, spaces: offer.claimSpaces, isBackup: offer.isBackup }, offer.id)
      .catch(() => {})

    notify({
      to: { email: row.email, phone: row.phone, firstName: (row.name ?? '').split(' ')[0] || 'there' },
      template: 'waitlist_offer',
      vars: {
        firstName: (row.name ?? '').split(' ')[0] || 'there',
        sessionTitle: session.title, sessionDate: session.date, sessionTime: session.time, venue: session.venue,
        spaces: offer.claimSpaces, claimUrl: `${APP_URL}/claim/${token}`, expiresMinutes: claimMinutes,
        competitive: sameDay, expiresAt: claimExpiresAt,
      },
    }).catch(err => console.error('[cascade] notify failed:', err))
  }

  return { openSpots, offered: offers.length }
}

// For each candidate that is a lower preference within a group, drop it if a
// higher-ranked preference session (same group, smaller preference_rank) still
// has availability.
async function filterHigherPreferenceAvailable<T extends { waitlist_group_id: string | null; preference_rank: number }>(rows: T[]): Promise<T[]> {
  const groupIds = [...new Set(rows.map(r => r.waitlist_group_id).filter(Boolean))] as string[]
  if (!groupIds.length) return rows

  const { data: groupRows } = await supabaseAdmin
    .from('waitlist').select('waitlist_group_id,preference_rank,session_id').in('waitlist_group_id', groupIds)
  const byGroup = new Map<string, { preference_rank: number; session_id: string }[]>()
  ;(groupRows ?? []).forEach(g => {
    const arr = byGroup.get(g.waitlist_group_id) ?? []
    arr.push({ preference_rank: g.preference_rank ?? 1, session_id: g.session_id })
    byGroup.set(g.waitlist_group_id, arr)
  })

  // Cache availability per session we need to check.
  const availCache = new Map<string, number>()
  const availOf = async (sid: string) => {
    if (!availCache.has(sid)) availCache.set(sid, (await openSpotsFor(sid)) - (await liveOfferedSpaces(sid)))
    return availCache.get(sid)!
  }

  const keep: T[] = []
  for (const r of rows) {
    if (!r.waitlist_group_id) { keep.push(r); continue }
    const higher = (byGroup.get(r.waitlist_group_id) ?? []).filter(g => g.preference_rank < r.preference_rank)
    let higherHasRoom = false
    for (const h of higher) { if ((await availOf(h.session_id)) > 0) { higherHasRoom = true; break } }
    if (!higherHasRoom) keep.push(r)
  }
  return keep
}
