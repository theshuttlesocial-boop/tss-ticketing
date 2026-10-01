// How long a seat is held while someone pays. Owner's rules (1 Oct 2026):
//
//   waitlist claim on session day   1 minute   (everyone offered, first to pay wins)
//   waitlist claim before that day   5 minutes  (offered to one person, in order)
//   tickets page on release day      2 minutes  (heavy traffic when a session goes live)
//   anything else                    10 minutes (the database default; return null)
//
// Measured over 236 release-day payments (Aug–Sep 2026): median 17 s, 95% within
// 73 s, slowest 211 s, none over 5 minutes. Someone slower than their hold can
// lose the seat; if both people then pay, confirm-payment refunds the later one.

export const CLAIM_HOLD_SESSION_DAY_SECONDS = 60
export const CLAIM_HOLD_BEFORE_DAY_SECONDS = 5 * 60
export const RELEASE_DAY_HOLD_SECONDS = 2 * 60

const londonDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d)

/** Seconds to hold the seat for, or null to keep the database default (10 minutes). */
export function holdSecondsFor(o: {
  isClaim: boolean
  sessionDate: string | null | undefined   // YYYY-MM-DD
  opensAt: string | null | undefined       // when tickets went on sale
  now?: Date
}): number | null {
  const today = londonDate(o.now ?? new Date())
  if (o.isClaim) return o.sessionDate === today ? CLAIM_HOLD_SESSION_DAY_SECONDS : CLAIM_HOLD_BEFORE_DAY_SECONDS
  if (o.opensAt && londonDate(new Date(o.opensAt)) === today) return RELEASE_DAY_HOLD_SECONDS
  return null
}
