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

// Choose who to offer the open spots to.
//  - tier filter (inside window: new players only; if none, fall through to all)
//  - fit filter  (min_spaces_acceptable must fit in openSpots)
//  - sort by largest allocatable group first, then queue position
//  - greedy allocate down the list until spots run out (never below a person's
//    minimum), then add the next 2 as competitive backups
export function selectOffers(candidates: MatchCandidate[], openSpots: number, windowActive: boolean): Offer[] {
  if (openSpots <= 0) return []

  // Tier filter — never leave a spot empty just to protect the tier.
  let pool = candidates
  if (windowActive) {
    const newOnly = candidates.filter(c => c.priorSessionCount === 0)
    pool = newOnly.length > 0 ? newOnly : candidates
  }

  // Fit filter.
  pool = pool.filter(c => c.minSpaces <= openSpots)

  // Filling the session is the priority: largest allocatable group first.
  const allocatable = (c: MatchCandidate) => Math.min(c.spacesNeeded, openSpots)
  const sorted = [...pool].sort((a, b) => allocatable(b) - allocatable(a) || a.position - b.position)

  // Greedy allocation.
  let remaining = openSpots
  const winners: Offer[] = []
  const chosen = new Set<string>()
  for (const c of sorted) {
    if (remaining <= 0) break
    const give = Math.min(c.spacesNeeded, remaining)
    if (give < c.minSpaces) continue          // can't satisfy their minimum with what's left
    winners.push({ id: c.id, claimSpaces: give, isBackup: false })
    chosen.add(c.id)
    remaining -= give
  }

  // Up to 2 competitive backups (first to pay wins; the seat hold prevents oversell).
  const backups: Offer[] = []
  for (const c of sorted) {
    if (backups.length >= 2) break
    if (chosen.has(c.id)) continue
    backups.push({ id: c.id, claimSpaces: allocatable(c), isBackup: true })
  }

  return [...winners, ...backups]
}
