import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Permanent redirect target for a printed QR code.
 *
 * Laminate one QR pointing at /live/latest and reuse it every week: it always
 * resolves to whichever session is currently live, so nothing is reprinted.
 */
export async function GET(req: Request) {
  const { data } = await supabaseAdmin
    .from('live_sessions')
    .select('id,status')
    .in('status', ['live', 'setup'])
    .order('created_at', { ascending: false })
    .limit(1)

  const session = data?.[0]
  const base = new URL(req.url).origin
  if (!session) return NextResponse.redirect(`${base}/tickets`, 302)
  return NextResponse.redirect(`${base}/live/${session.id}/join`, 302)
}
