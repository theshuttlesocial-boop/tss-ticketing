import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runCascade } from '@/lib/waitlist-matcher'

function authed(req: Request) {
  return req.headers.get('x-cron-secret') === process.env.CRON_SECRET
}

// Every ~2 min: expire stale offers, then re-run the cascade for any session
// that still has an unfilled release.
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Expire stale offers globally.
  await supabaseAdmin.from('waitlist')
    .update({ status: 'expired' })
    .eq('status', 'offered').lt('claim_expires_at', new Date().toISOString())

  // Sessions with an unresolved release (outcome still null == needs a replacement).
  const { data: releases } = await supabaseAdmin
    .from('releases').select('session_id').is('outcome', null)
  const sessionIds = [...new Set((releases ?? []).map(r => r.session_id))]

  const results: Record<string, { openSpots: number; offered: number }> = {}
  for (const sid of sessionIds) {
    try { results[sid] = await runCascade(sid) }
    catch (err) { console.error('[cron/cascade] runCascade failed for', sid, err) }
  }

  return NextResponse.json({ ran: sessionIds.length, results })
}

// Allow GET too (some cron providers only issue GET).
export async function GET(req: Request) { return POST(req) }
