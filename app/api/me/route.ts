import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ensurePlayer, mySessions, userFromRequest } from '@/lib/account'

/** The signed-in player's own profile and sessions. Nobody else's. */
export async function GET(req: Request) {
  const u = await userFromRequest(req)
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  try {
    const p = await ensurePlayer(u)
    return NextResponse.json({
      profile: { email: p.email, firstName: p.first_name, lastInitial: p.last_initial, displayName: p.display_name,
        level: p.level_self, leaderboard: p.leaderboard_opt_in },
      sessions: await mySessions(p),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Update your own name and level. Only these fields; nothing else is accepted. */
export async function PATCH(req: Request) {
  const u = await userFromRequest(req)
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (typeof b.firstName === 'string' || typeof b.lastName === 'string') {
    const first = String(b.firstName ?? '').trim().slice(0, 30), last = String(b.lastName ?? '').trim().slice(0, 30)
    if (first.length < 1) return NextResponse.json({ error: 'Enter your first name' }, { status: 400 })
    Object.assign(update, { first_name: first, last_initial: last ? last[0].toUpperCase() : null,
      display_name: `${first} ${last}`.trim() })
  }
  if (b.level !== undefined) {
    if (!['beginner', 'standard', 'intermediate', 'strong'].includes(b.level))
      return NextResponse.json({ error: 'Pick a level' }, { status: 400 })
    update.level_self = b.level
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const p = await ensurePlayer(u)
  const { error } = await supabaseAdmin.from('players').update(update).eq('id', p.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
