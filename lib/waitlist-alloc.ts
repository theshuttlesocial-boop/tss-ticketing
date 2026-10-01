// Pure allocation logic for the tiered waitlist. No DB / framework deps so the
// tier window and group-allocation rules can be unit-tested directly.

export interface MatchCandidate {
  id: string                 // waitlist row id
  email: string
  groupId: string | null     // waitlist_group_id
  position: number
  preferenceRank: number
  spacesNeeded: number
  minSpaces: number          // min_spaces_acceptable
  priorSessionCount: number  // prior_session_count(email); 0 == new player
}

export interface Offer {
  id: string
  claimSpaces: number
  isBackup: boolean
}

// A person must never hold two LIVE offers at once. A "live offer" is a waitlist
// row with status 'offered' and an unexpired claim window — matched by email and
// by group. Note this is deliberately about LIVE offers only: a 'claimed' or
// 'waiting' row is not a conflict, so someone who claims their Thursday spot
// keeps their Friday entry eligible.
export function hasLiveOfferConflict(
  candidate: { email: string; groupId: string | null },
  liveEmails: Set<string>,
  liveGroups: Set<string>,
): boolean {
  if (liveEmails.has(candidate.email.toLowerCase())) return true
  if (candidate.groupId && liveGroups.has(candidate.groupId)) return true
  return false
}

// Tier window length in minutes, by how far away the session is.
//   today       -> 0   (no tier, everyone eligible immediately)
//   tomorrow    -> 60  (new players only for 60 min from release)
//   2+ days     -> 120 (new players only for 120 min from release)
export function tierWindowMinutes(sessionDate: string, now: Date): number {
  const [y, mo, d] = sessionDate.split('-').map(Number)
  const sessionMidnightUTC = Date.UTC(y, mo - 1, d)
  const nowMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const days = Math.round((sessionMidnightUTC - nowMidnightUTC) / 86_400_000)
  if (days <= 0) return 0
  if (days === 1) return 60
  return 120
}

// Is the new-players-only window currently active for this session? Anchored on
// the release moment; false once no tier applies (today) or the window elapsed.
export function isTierWindowActive(sessionDate: string, releasedAt: Date, now: Date): boolean {
  const minutes = tierWindowMinutes(sessionDate, now)
  if (minutes === 0) return false
  return now.getTime() < releasedAt.getTime() + minutes * 60_000
}

/** The session's date is today in the UK: the waitlist switches to "everyone at once". */
export function isSessionDayLondon(sessionDate: string, now: Date): boolean {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now) === sessionDate
}

/**
 * Session day: tapping "Claim & pay" holds the seat for only this long. Everyone
 * waiting has the same offer and "the first to pay gets it", so a long hold let
 * one person who didn't pay block everyone else (1 Oct 2026: a released spot sat
 * unsold for hours behind repeated 10-minute holds). Public bookings and
 * day-before offers keep the normal 10-minute hold (Apple Pay / 3DS need it).
 */
export const SESSION_DAY_CLAIM_HOLD_SECONDS = 60

/** How long a one-at-a-time offer is held for that person (day before or earlier). */
export const QUEUE_OFFER_MINUTES = 20

// Day before or earlier: offer strictly in waitlist order, one person per free space,
// and hold those spaces for them (no backups racing them).
//  - tier filter (inside the new-players window: new players only; if none, everyone)
//  - in queue order, give each person min(needed, free left); skip anyone whose
//    minimum no longer fits, so a single space can go to the next person who needs one
export function selectQueueOffers(candidates: MatchCandidate[], freeSpots: number, windowActive: boolean): Offer[] {
  if (freeSpots <= 0) return []
  let pool = candidates
  if (windowActive) {
    const newOnly = candidates.filter(c => c.priorSessionCount === 0)
    pool = newOnly.length > 0 ? newOnly : candidates
  }
  let remaining = freeSpots
  const offers: Offer[] = []
  for (const c of [...pool].sort((a, b) => a.position - b.position)) {
    if (remaining <= 0) break
    const give = Math.min(c.spacesNeeded, remaining)
    if (give < c.minSpaces) continue
    offers.push({ id: c.id, claimSpaces: give, isBackup: false })
    remaining -= give
  }
  return offers
}

// On the day: filling the session comes first, so everyone on the waitlist whose
// minimum fits is offered at once, and the first to pay gets the space(s).
export function selectSameDayOffers(candidates: MatchCandidate[], openSpots: number): Offer[] {
  if (openSpots <= 0) return []
  return [...candidates]
    .sort((a, b) => a.position - b.position)
    .filter(c => c.minSpaces <= openSpots)
    .map(c => ({ id: c.id, claimSpaces: Math.min(c.spacesNeeded, openSpots), isBackup: true }))
}
