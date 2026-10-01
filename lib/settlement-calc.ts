// Pure predicates for the card-refund fee ladder — no DB deps, unit-testable.

// Only a FULFILLED CARD refund accrues the fee ladder. A store-credit release or
// a name-change (never a 'card' + 'replaced' release) is excluded here — this is
// exactly why credits don't count toward the 50p repeat-refund fee.
export function isFeeAccruingRelease(r: { refund_preference: string; outcome: string | null }): boolean {
  return r.refund_preference === 'card' && r.outcome === 'replaced'
}

// Was the release made in the [before - days, before) window? The current
// release is evaluated "as at" its own released_at, counting only prior ones.
export function withinPriorWindow(releasedAt: string, beforeIso: string, days: number): boolean {
  const t = new Date(releasedAt).getTime()
  const before = new Date(beforeIso).getTime()
  return t >= before - days * 86_400_000 && t < before
}

/**
 * How many of a session's still-open released spaces a just-paid booking took.
 * seats in use (net of releases) + open released spaces − capacity, capped at the
 * booking's own size and never below 0. See settleReleasesFilledBy.
 */
export function releasedSpacesTaken(inUse: number, openReleased: number, capacity: number, quantity: number): number {
  if (openReleased <= 0) return 0
  return Math.min(quantity, openReleased, Math.max(0, inUse + openReleased - capacity))
}
