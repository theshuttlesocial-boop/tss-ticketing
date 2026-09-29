import { NextResponse } from 'next/server'
import { staffFromRequest } from '@/lib/staff'
import { fullySignedIn, isAdminRole } from '@/lib/staffRules'
import { assignmentsFor } from '@/lib/lead'
import { supabaseAdmin } from '@/lib/supabase'
import { createLiveSession, LiveSessionError } from '@/lib/live-session/actions'

export async function POST(req: Request) {
  // Owners and admins; or a session lead assigned to a booking session right
  // now (tonight's), who then runs the live session they create.
  const staff = await staffFromRequest(req)
  if (!staff || !fullySignedIn(staff)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const ticketAssignment = isAdminRole(staff.role) ? null
    : (await assignmentsFor(staff)).find((a) => a.ticket_session_id) ?? null
  if (!isAdminRole(staff.role) && !ticketAssignment)
    return NextResponse.json({ error: 'Only owners, admins, or the session lead for tonight can create a live session' }, { status: 401 })
  // Any `config` in the body is ignored: the server builds it (lib/live-session/config.ts).
  const { name, roster, seed, courts } = await req.json()

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  // An empty roster is allowed: players can self-register via the QR. At least
  // 4 are needed before a round can be drawn, which the engine enforces.
  if (roster !== undefined && !Array.isArray(roster))
    return NextResponse.json({ error: 'roster must be a list' }, { status: 400 })
  for (const p of roster ?? []) {
    if (!p?.name) return NextResponse.json({ error: 'every player needs a name' }, { status: 400 })
    if (!['beginner', 'standard', 'intermediate', 'strong'].includes(p.level))
      return NextResponse.json({ error: `invalid level for ${p.name}` }, { status: 400 })
  }

  if (courts !== undefined && (!Number.isInteger(courts) || courts < 1 || courts > 12))
    return NextResponse.json({ error: 'courts must be a whole number between 1 and 12' }, { status: 400 })

  try {
    // A fixed default seed made every week's round 1 identical for the same
    // regulars (same people sat out first, same pairings). Random per session.
    const sessionSeed = Number.isInteger(seed) ? seed : Math.floor(Math.random() * 1_000_000_000)
    const id = await createLiveSession(name, roster ?? [], sessionSeed, courts)
    if (ticketAssignment && staff.email) {
      const { data: me } = await supabaseAdmin.from('staff').select('id').ilike('email', staff.email).single()
      await supabaseAdmin.from('session_leads').insert({ staff_id: me!.id, live_session_id: id,
        valid_from: ticketAssignment.valid_from, valid_to: ticketAssignment.valid_to })
    }
    return NextResponse.json({ id }, { status: 201 })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
