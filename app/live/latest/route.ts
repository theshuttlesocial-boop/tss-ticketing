import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/** Only a session created this recently counts as "tonight's". */
const LATEST_WINDOW_HOURS = 12

/**
 * Permanent redirect target for a printed QR code.
 *
 * Laminate one QR pointing at /live/latest and reuse it every week: it always
 * resolves to the session running now. A session left open from last week is
 * never picked up: only sessions created in the last 12 hours count, otherwise
 * the visitor gets a friendly "nothing running" page.
 */
export async function GET(req: Request) {
  const since = new Date(Date.now() - LATEST_WINDOW_HOURS * 3_600_000).toISOString()
  const { data } = await supabaseAdmin
    .from('live_sessions')
    .select('id,status')
    .in('status', ['live', 'setup'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)

  const session = data?.[0]
  const base = new URL(req.url).origin
  if (!session) return NextResponse.redirect(`${base}/live/none`, 302)
  return NextResponse.redirect(`${base}/live/${session.id}/join`, 302)
}
