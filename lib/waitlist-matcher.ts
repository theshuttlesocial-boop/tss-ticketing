import { supabaseAdmin } from '@/lib/supabase'

// ============================================================================
// runCascade — offer freed spaces to the waitlist.
//
// PHASE 2 SCOPE (this file): a minimal, safe skeleton so /api/release has a
// real function to call. It expires stale live offers and computes the number
// of genuinely open spots (net of released spaces). It does NOT yet select
// candidates, apply the tier window, or notify anyone.
//
// PHASE 3 replaces the body below with the full tiered-matching + notify
// algorithm (see the project brief). The signature is stable.
// ============================================================================
export async function runCascade(sessionId: string): Promise<{ openSpots: number; offered: number }> {
  // 2. Expire offers whose claim window has passed.
  await supabaseAdmin
    .from('waitlist')
    .update({ status: 'expired' })
    .eq('session_id', sessionId)
    .eq('status', 'offered')
    .lt('claim_expires_at', new Date().toISOString())

  const openSpots = await openSpotsFor(sessionId)
  // Phase 3: candidate selection, tier filter, allocation and notify() go here.
  return { openSpots, offered: 0 }
}

// Open spots = capacity − net confirmed bookings − active unexpired holds.
// "Net" means released spaces (bookings.spaces_released) count as available.
export async function openSpotsFor(sessionId: string): Promise<number> {
  const nowIso = new Date().toISOString()
  const [sessionRes, bookingsRes, holdsRes] = await Promise.all([
    supabaseAdmin.from('sessions').select('capacity').eq('id', sessionId).single(),
    supabaseAdmin.from('bookings').select('quantity,spaces_released').eq('session_id', sessionId).eq('stripe_status', 'succeeded'),
    supabaseAdmin.from('seat_holds').select('quantity').eq('session_id', sessionId).eq('used', false).gt('expires_at', nowIso),
  ])
  const capacity = sessionRes.data?.capacity ?? 0
  const booked = (bookingsRes.data ?? []).reduce((a, b) => a + (b.quantity - (b.spaces_released ?? 0)), 0)
  const held = (holdsRes.data ?? []).reduce((a, h) => a + h.quantity, 0)
  return capacity - booked - held
}
