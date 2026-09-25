import { NextResponse } from 'next/server'
import { loadSession, loadMeta, addPlayer, LiveSessionError } from '@/lib/live-session/actions'
import { LEVELS } from '@/lib/live-session/levels'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Self-registration — deliberately PUBLIC, no admin secret.
 *
 * A player scanning the session QR adds themselves. The QR is the credential:
 * you have to be in the hall to scan it. Guarded so it cannot be used to
 * vandalise a session:
 *   - only while the session is in 'setup' or 'live'
 *   - a name already present returns that player instead of erroring, so a
 *     re-scan on a new phone gets you back to your own page
 *   - no level changes to an existing player; the organiser owns that
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const { name, level } = await req.json()

  const clean = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (clean.length < 2) return NextResponse.json({ error: 'Please enter your name' }, { status: 400 })
  if (clean.length > 40) return NextResponse.json({ error: 'That name is too long' }, { status: 400 })
  if (!LEVELS.includes(level)) return NextResponse.json({ error: 'Pick a level' }, { status: 400 })

  try {
    const [session, meta] = await Promise.all([loadSession(id), loadMeta(id)])
    if (meta.status === 'finished')
      return NextResponse.json({ error: 'This session has finished' }, { status: 409 })

    const existing = Object.values(session.players)
      .find((p) => p.name.toLowerCase() === clean.toLowerCase())
    if (existing) {
      // Re-entry by name lets a player on a new phone get back to their page —
      // but it would also let anyone open anyone's page (and rating) just by
      // typing their name. So it only works before the session starts, when
      // ratings are still just starting levels. After that, the organiser
      // hands out the player's own link from the Roster tab.
      if (meta.status === 'setup') return NextResponse.json({ player_id: existing.id, existing: true })
      return NextResponse.json(
        { error: `${existing.name} is already registered — ask the organiser for your link` }, { status: 409 })
    }

    if (!meta.registrationOpen)
      return NextResponse.json({ error: 'Registration is closed — ask the organiser to add you' }, { status: 403 })

    await addPlayer(id, clean, level)

    const after = await loadSession(id)
    const me = Object.values(after.players).find((p) => p.name.toLowerCase() === clean.toLowerCase())
    if (!me) throw new LiveSessionError('could not add you to the session')
    return NextResponse.json({ player_id: me.id, existing: false }, { status: 201 })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
