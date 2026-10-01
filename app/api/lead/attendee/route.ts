import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { staffFromRequest } from '@/lib/staff'
import { fullySignedIn } from '@/lib/staffRules'
import { canRunTicketSession } from '@/lib/lead'
import { addPlayer, LiveSessionError } from '@/lib/live-session/actions'
import { LEVELS } from '@/lib/live-session/levels'
import { cleanOptionalEmail, saveLivePlayerEmail } from '@/lib/attendance'

/**
 * Add someone who isn't on the booking list (no phone, a plus-one, a walk-in).
 * Owners, admins, and the lead for this session. They join tonight's live
 * session (so they're in the court rotation) and count as attended.
 */
export async function POST(req: Request) {
  const s = await staffFromRequest(req)
  if (!s || !fullySignedIn(s)) return NextResponse.json({ error: 'Sign in with your staff account' }, { status: 401 })
  const { ticket_session_id, first, last, level, email } = await req.json().catch(() => ({}))
  if (!ticket_session_id || !(await canRunTicketSession(s, ticket_session_id)))
    return NextResponse.json({ error: 'Not your session' }, { status: 403 })

  const name = `${String(first ?? '').trim()} ${String(last ?? '').trim()}`.trim().replace(/\s+/g, ' ')
  if (!String(first ?? '').trim()) return NextResponse.json({ error: 'Enter their first name' }, { status: 400 })
  if (name.length > 40) return NextResponse.json({ error: 'That name is too long' }, { status: 400 })
  if (!LEVELS.includes(level)) return NextResponse.json({ error: 'Pick their level' }, { status: 400 })
  let clean: string | null
  try { clean = cleanOptionalEmail(email) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

  const { data: live, error } = await supabaseAdmin.from('live_sessions').select('id,status')
    .eq('ticket_session_id', ticket_session_id).in('status', ['setup', 'live'])
    .order('created_at', { ascending: false }).limit(1)
  if (error) return NextResponse.json({ error: 'Run migration 029 in Supabase to turn on attendance' }, { status: 500 })
  if (!live?.length) return NextResponse.json({ error: "Start tonight's live session first, then add them" }, { status: 409 })

  try {
    const playerId = await addPlayer(live[0].id, name, level, { actor: s.email ?? 'staff' })
    await saveLivePlayerEmail(playerId, clean, s.email ?? 'staff')
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LiveSessionError ? 400 : 500 })
  }
}
