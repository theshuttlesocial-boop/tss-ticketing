// A scheduled-release session is created as status='draft' with an opens_at.
// If that opens_at is already in the past, the session should just be OPEN — the
// public page treats it as bookable, so the stored status must agree, otherwise
// the atomic booking gate (claim_seat_hold) can reject it as "Session not
// available". This keeps the persisted status honest at write time.
//
// Only promotes draft -> open. Never touches open/closed/cancelled.
export function normaliseScheduledStatus(
  status: string | null | undefined,
  opensAt: string | null | undefined,
  now: Date = new Date(),
): string {
  const s = status ?? 'draft'
  if (s === 'draft' && opensAt && new Date(opensAt) <= now) return 'open'
  return s
}
