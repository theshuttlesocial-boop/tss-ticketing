import { requireAdmin } from '@/lib/staff'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runCascade, openSpotsFor, liveOfferedSpaces, offerToWaitlistEntry, withdrawOffer, OfferError } from '@/lib/waitlist-matcher'
import { logAudit } from '@/lib/audit'

/** Owners and admins (personal login, or the owner-only emergency password). */
async function checkAdmin(req: Request) {
  return !!(await requireAdmin(req))
}

// For "Choose who gets it": every session with an open release or a live offer, with its
// free spaces, whether automatic offers are paused, and its waitlist in queue order.
async function manageable(sessionIds: string[]) {
  const ids = [...new Set(sessionIds)].filter(Boolean)
  if (!ids.length) return []
  const [{ data: sessions }, { data: rows }] = await Promise.all([
    supabaseAdmin.from('sessions').select('*').in('id', ids),
    supabaseAdmin.from('waitlist').select('id,session_id,name,email,position,spaces_needed,min_spaces_acceptable,status,claim_spaces,claim_expires_at,times_offered')
      .in('session_id', ids).in('status', ['waiting', 'offered', 'expired']).order('position', { ascending: true }),
  ])
  const nowIso = new Date().toISOString()
  return Promise.all((sessions ?? []).map(async (s) => {
    const open = await openSpotsFor(s.id)
    const live = await liveOfferedSpaces(s.id)
    const list = (rows ?? []).filter((r) => r.session_id === s.id)
      .map((r) => ({ ...r, live: r.status === 'offered' && !!r.claim_expires_at && r.claim_expires_at > nowIso }))
    return {
      session: { id: s.id, title: s.title, date: s.date, time: s.time },
      manual: !!(s as { waitlist_manual?: boolean }).waitlist_manual,
      openSpots: open, freeSpots: Math.max(0, open - live), waitlist: list,
    }
  }))
}

// GET — unresolved releases, recently resolved ones, and current live offers.
export async function GET(req: Request) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const [unresolvedRes, resolvedRes, offersRes] = await Promise.all([
    supabaseAdmin.from('releases')
      .select('id,session_id,spaces,refund_preference,released_at,outcome,admin_fee_pence,bookings(name,email,booking_ref),sessions(title,date,time)')
      .is('outcome', null).order('released_at', { ascending: true }),
    supabaseAdmin.from('releases')
      .select('id,spaces,refund_preference,released_at,resolved_at,outcome,admin_fee_pence,bookings(name,email,booking_ref),sessions(title,date)')
      .not('outcome', 'is', null).order('released_at', { ascending: false }).limit(25),
    supabaseAdmin.from('waitlist')
      .select('id,session_id,name,email,claim_spaces,claim_expires_at,times_offered,sessions(title,date)')
      .eq('status', 'offered').gt('claim_expires_at', new Date().toISOString()).order('claim_expires_at', { ascending: true }),
  ])

  const sessionIds = [
    ...(unresolvedRes.data ?? []).map((r: any) => r.session_id),
    ...(offersRes.data ?? []).map((o: any) => o.session_id),
  ]
  return NextResponse.json({
    manage: await manageable(sessionIds),
    unresolved: unresolvedRes.data ?? [],
    resolved: resolvedRes.data ?? [],
    offers: offersRes.data ?? [],
  })
}

// POST — admin overrides.
export async function POST(req: Request) {
  const staff = await requireAdmin(req)
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { action, session_id, release_id } = body
  const by = staff.email ?? 'owner (emergency password)'

  // Choose who gets a released space (owners and admins).
  try {
    if (action === 'offer_to') {
      if (!body.waitlist_id) return NextResponse.json({ error: 'waitlist_id required' }, { status: 400 })
      const r = await offerToWaitlistEntry(body.waitlist_id, { spaces: body.spaces, minutes: body.minutes, by })
      return NextResponse.json({ success: true, ...r })
    }
    if (action === 'withdraw_offer') {
      if (!body.waitlist_id) return NextResponse.json({ error: 'waitlist_id required' }, { status: 400 })
      return NextResponse.json({ success: true, ...(await withdrawOffer(body.waitlist_id, by)) })
    }
  } catch (e) {
    if (e instanceof OfferError) return NextResponse.json({ error: e.message }, { status: 409 })
    throw e
  }
  if (action === 'set_manual') {
    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    const manual = !!body.manual
    const { error } = await supabaseAdmin.from('sessions').update({ waitlist_manual: manual }).eq('id', session_id)
    if (error) return NextResponse.json({ error: 'Run migration 028 first.' }, { status: 500 })
    await logAudit('waitlist_manual', { session_id, manual, by }, session_id)
    // Back to automatic: offer any free space straight away.
    const result = manual ? null : await runCascade(session_id)
    return NextResponse.json({ success: true, manual, ...(result ?? {}) })
  }

  if (action === 'release_all') {
    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    const result = await runCascade(session_id, { ignoreTier: true, everyone: true })
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
