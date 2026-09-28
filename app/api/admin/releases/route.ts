import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runCascade } from '@/lib/waitlist-matcher'
import { logAudit } from '@/lib/audit'

function checkAdmin(req: Request) {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
}

// GET — unresolved releases, recently resolved ones, and current live offers.
export async function GET(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const [unresolvedRes, resolvedRes, offersRes] = await Promise.all([
    supabaseAdmin.from('releases')
      .select('id,session_id,spaces,refund_preference,released_at,outcome,admin_fee_pence,bookings(name,email,booking_ref),sessions(title,date,time)')
      .is('outcome', null).order('released_at', { ascending: true }),
    supabaseAdmin.from('releases')
      .select('id,spaces,refund_preference,released_at,resolved_at,outcome,admin_fee_pence,bookings(name,email,booking_ref),sessions(title,date)')
      .not('outcome', 'is', null).order('released_at', { ascending: false }).limit(25),
    supabaseAdmin.from('waitlist')
      .select('id,name,email,claim_spaces,claim_expires_at,times_offered,sessions(title,date)')
      .eq('status', 'offered').gt('claim_expires_at', new Date().toISOString()).order('claim_expires_at', { ascending: true }),
  ])

  return NextResponse.json({
    unresolved: unresolvedRes.data ?? [],
    resolved: resolvedRes.data ?? [],
    offers: offersRes.data ?? [],
  })
}

// POST — admin overrides.
export async function POST(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { action, session_id, release_id } = await req.json().catch(() => ({}))

  if (action === 'release_all') {
    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    const result = await runCascade(session_id, { ignoreTier: true })
    await logAudit('admin_release_all', { session_id, ...result }, session_id)
    return NextResponse.json({ success: true, ...result })
  }

  if (action === 'mark_replaced') {
    if (!release_id) return NextResponse.json({ error: 'release_id required' }, { status: 400 })
    const { data: release } = await supabaseAdmin.from('releases').select('booking_id,outcome').eq('id', release_id).maybeSingle()
    if (!release) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await supabaseAdmin.from('releases').update({ outcome: 'replaced', resolved_at: new Date().toISOString() }).eq('id', release_id)
    await supabaseAdmin.from('bookings').update({ release_status: 'replaced' }).eq('id', release.booking_id)
    await logAudit('admin_mark_replaced', { release_id }, release_id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
