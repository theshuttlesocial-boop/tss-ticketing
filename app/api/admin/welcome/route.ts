import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/staff'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Admin → Settings → Welcome offer (Phase 8): who used the welcome discount, and how
 * people who used /join heard about us. Owners and admins only.
 */
export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const since = new Date(Date.now() - 30 * 864e5).toISOString()
  const [red, joins] = await Promise.all([
    supabaseAdmin.from('welcome_redemptions').select('email,booking_ref,amount_pence,src,status,created_at,redeemed_at')
      .order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('join_requests').select('heard_from,src,created_at').gte('created_at', since),
  ])
  if (red.error) return NextResponse.json({ missing: true, redemptions: [], joins: null })
  const byHeard: Record<string, number> = {}
  ;(joins.data ?? []).forEach((j) => { const k = j.heard_from ?? 'Not given'; byHeard[k] = (byHeard[k] ?? 0) + 1 })
  return NextResponse.json({
    redemptions: red.data ?? [],
    joins: { last30: (joins.data ?? []).length, byHeard },
  })
}
