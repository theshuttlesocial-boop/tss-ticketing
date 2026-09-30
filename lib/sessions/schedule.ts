// Sessions are normally created as status='draft' with a scheduled opens_at, and
// the stored status is never flipped when that time passes. Everything that
// decides "is this session open?" must therefore use the EFFECTIVE status:
// a draft whose opens_at has passed is open. The public pages (lib/sessions/
// public.ts) and the booking gate (claim_seat_hold, migration 017) already do.
//
// Only a draft is promoted. open/closed/cancelled are returned unchanged.
export function effectiveSessionStatus(
  status: string | null | undefined,
  opensAt: string | null | undefined,
  now: Date = new Date(),
): string {
  const s = status ?? 'draft'
  if (s === 'draft' && opensAt && new Date(opensAt) <= now) return 'open'
  return s
}
