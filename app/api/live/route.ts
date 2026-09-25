import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { createLiveSession, LiveSessionError } from '@/lib/live-session/actions'

export async function POST(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { name, roster, seed, config, courts } = await req.json()

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
    const id = await createLiveSession(name, roster ?? [], sessionSeed, config, courts)
    return NextResponse.json({ id }, { status: 201 })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
