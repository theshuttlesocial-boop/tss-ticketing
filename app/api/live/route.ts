import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { createLiveSession, LiveSessionError } from '@/lib/live-session/actions'

export async function POST(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { name, roster, seed, config, courts } = await req.json()

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!Array.isArray(roster) || roster.length < 4)
    return NextResponse.json({ error: 'roster needs at least 4 players' }, { status: 400 })
  for (const p of roster) {
    if (!p?.name) return NextResponse.json({ error: 'every player needs a name' }, { status: 400 })
    if (!['beginner', 'standard', 'intermediate', 'strong'].includes(p.level))
      return NextResponse.json({ error: `invalid level for ${p.name}` }, { status: 400 })
  }

  if (courts !== undefined && (!Number.isInteger(courts) || courts < 1 || courts > 12))
    return NextResponse.json({ error: 'courts must be a whole number between 1 and 12' }, { status: 400 })

  try {
    const id = await createLiveSession(name, roster, seed ?? 1, config, courts)
    return NextResponse.json({ id }, { status: 201 })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
