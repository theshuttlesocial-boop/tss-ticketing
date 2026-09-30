import { supabaseAdmin } from '@/lib/supabase'

function getAvailability(spotsRemaining: number) {
  if (spotsRemaining <= 0) return { availability: 'sold_out' as const }
  if (spotsRemaining <= 5) return { availability: 'limited' as const, spotsRemaining }
  return { availability: 'available' as const }
}

/**
 * Upcoming sessions as the public sees them: open ones with live availability,
 * plus "coming soon" drafts an admin has chosen to show. Capacity is never exposed.
 * Shared by GET /api/sessions (tickets page) and the marketing site.
 */
export async function getPublicSessions(now = new Date()) {
  const today = now.toISOString().split('T')[0]  // YYYY-MM-DD — exclude past sessions

  const [sessionsRes, settingsRes] = await Promise.all([
    supabaseAdmin.from('sessions').select('*')
      .in('status', ['open','draft'])
      .eq('cancelled_occurrence', false)
      .gte('date', today)
      .order('date', { ascending: true }),
    supabaseAdmin.from('site_settings').select('*')
  ])

  if (sessionsRes.error) return { error: sessionsRes.error.message }

  const settings: Record<string,string> = {}
  // Only the settings the public pages show. Others (e.g. the WhatsApp invite link,
  // which /join hands out) must never leave the server.
  const PUBLIC_SETTINGS = ['about_text', 'terms_and_conditions']
  ;(settingsRes.data ?? []).forEach(s => { if (PUBLIC_SETTINGS.includes(s.key)) settings[s.key] = s.value })

  // Separate into open vs coming_soon in one pass
  const openSessions: (typeof sessionsRes.data)[number][] = []
  const comingSoon: (typeof sessionsRes.data)[number][] = []

  for (const session of sessionsRes.data ?? []) {
    const isScheduledOpen = session.opens_at && new Date(session.opens_at) <= now
    const effectiveStatus = isScheduledOpen ? 'open' : session.status
    if (effectiveStatus === 'draft') {
      // Only when an admin has switched on "Coming soon" for it (migration 023).
      // Before that migration the column doesn't exist: keep the old behaviour.
      const showIt = (session as any).show_coming_soon !== false
      if (showIt && session.opens_at && new Date(session.opens_at) > now) comingSoon.push(session)
      // else: pure draft, skip
    } else {
      openSessions.push(session)
    }
  }

  // Two bulk queries instead of 2× N per-session queries
  const openIds = openSessions.map(s => s.id)
  const [bookingsRes, holdsRes] = openIds.length > 0
    ? await Promise.all([
        supabaseAdmin.from('bookings').select('session_id,quantity,spaces_released').in('session_id', openIds).in('stripe_status', ['succeeded','partially_refunded']),
        supabaseAdmin.from('seat_holds').select('session_id,quantity').in('session_id', openIds).eq('used', false).gt('expires_at', now.toISOString()),
      ])
    : [{ data: [] as {session_id:string;quantity:number;spaces_released:number}[] }, { data: [] as {session_id:string;quantity:number}[] }]

  const bookedBy: Record<string,number> = {}
  const heldBy:   Record<string,number> = {}
  // Net of released spaces: a released spot reads as available.
  ;(bookingsRes.data ?? []).forEach(b => { bookedBy[b.session_id] = (bookedBy[b.session_id] ?? 0) + (b.quantity - ((b as any).spaces_released ?? 0)) })
  ;(holdsRes.data   ?? []).forEach(h => { heldBy[h.session_id]   = (heldBy[h.session_id]   ?? 0) + h.quantity })

  const sessions = [
    ...openSessions.map(s => {
      const booked = bookedBy[s.id] ?? 0
      const held   = heldBy[s.id]   ?? 0
      const spotsRemaining = s.capacity - booked - held
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { capacity: _cap, ...pub } = s
      return { ...pub, status: 'open' as const, ...getAvailability(spotsRemaining) }
    }),
    ...comingSoon.map(s => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { capacity: _cap, ...pub } = s
      return { ...pub, status: 'coming_soon' as const, availability: 'available' as const }
    }),
  ].sort((a, b) => a.date.localeCompare(b.date))

  return { sessions, settings }
}

export type PublicSession = Extract<Awaited<ReturnType<typeof getPublicSessions>>, { sessions: unknown }>['sessions'][number]
