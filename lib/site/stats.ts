import { supabaseAdmin } from '@/lib/supabase'

/**
 * Sessions 1–69 (26 Aug 2025 – 10 Jul 2026) live in the attendance tracker spreadsheet.
 * Everything after that is counted from the sessions table, so the number on the
 * website goes up by itself after each night.
 */
export const TRACKER_SESSIONS = 69
export const TRACKER_LAST_DATE = '2026-07-10'

/** Figures the club supplies; update here when they change. */
export const CLUB_STATS = {
  players: 500,        // different people who have played
  whatsapp: 1000,      // WhatsApp community members
  regulars: 50,        // players with 10+ sessions
  fastestSellOutSeconds: 30,
  firstSession: '2025-08-26',
}

/** Sessions that have actually run: past date, not cancelled, at least one paid booking. */
export async function getSessionsRun(now = new Date()): Promise<number> {
  const today = now.toISOString().split('T')[0]
  const { data: past, error } = await supabaseAdmin
    .from('sessions').select('id')
    .gt('date', TRACKER_LAST_DATE).lt('date', today)
    .neq('status', 'cancelled').eq('cancelled_occurrence', false)
  if (error || !past?.length) return TRACKER_SESSIONS
  const { data: paid } = await supabaseAdmin
    .from('bookings').select('session_id')
    .in('session_id', past.map((s) => s.id))
    .in('stripe_status', ['succeeded', 'partially_refunded'])
  return TRACKER_SESSIONS + new Set((paid ?? []).map((b) => b.session_id)).size
}
