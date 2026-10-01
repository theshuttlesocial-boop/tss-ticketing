import { NextResponse } from 'next/server'
import { loadSession, loadMeta, addPlayer, autoFinishIfStale, LiveSessionError } from '@/lib/live-session/actions'
import { LEVELS } from '@/lib/live-session/levels'
import { playerCookie } from '@/lib/live-session/pin'
import { issuePin } from '@/lib/live-session/pinServer'
import { supabaseAdmin } from '@/lib/supabase'
import { ensurePlayer, userFromRequest } from '@/lib/account'
import { cleanOptionalEmail, saveLivePlayerEmail } from '@/lib/attendance'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Self-registration — deliberately PUBLIC, no admin secret.
 *
 * A player scanning the session QR adds themselves. The QR is the credential:
 * you have to be in the hall to scan it. Guarded so it cannot be used to
 * vandalise a session:
 *   - only while the session is in 'setup' or 'live'
 *   - a name already present is refused: getting back to your page is by
 *     this phone's cookie, your PIN ("Already registered?"), or the
 *     organiser's link — never by typing a name
 *   - no level changes to an existing player; the organiser owns that
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const { name, level, email } = await req.json()

  const clean = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (clean.length < 2) return NextResponse.json({ error: 'Please enter your name' }, { status: 400 })
  if (clean.length > 40) return NextResponse.json({ error: 'That name is too long' }, { status: 400 })
  if (!LEVELS.includes(level)) return NextResponse.json({ error: 'Pick a level' }, { status: 400 })
  // Optional: links them to their booking and lets their attendance show in My portal.
  let typedEmail: string | null
  try { typedEmail = cleanOptionalEmail(email) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

  try {
    const meta = await autoFinishIfStale(id, await loadMeta(id))
    const session = await loadSession(id)
    if (meta.status === 'finished')
      return NextResponse.json({ error: 'This session has finished' }, { status: 409 })

    // Signed in? Your account is who you are — no PIN needed. If you're already
    // in this session (on any phone), you go straight back to your page.
    const user = await userFromRequest(req)
    const account = user ? await ensurePlayer(user).catch(() => null) : null
    if (account) {
      const { data: mine } = await supabaseAdmin.from('live_session_players').select('id')
        .eq('session_id', id).eq('player_id', account.id).maybeSingle()
      if (mine) {
        const res = NextResponse.json({ player_id: mine.id, existing: true })
        res.cookies.set(playerCookie(id, mine.id, new URL(req.url).protocol === 'https:'))
        return res
      }
    }

    const existing = Object.values(session.players)
      .find((p) => p.name.toLowerCase() === clean.toLowerCase())
    if (existing) {
      // Typing a name alone never opens someone's page any more (it used to
      // during setup, which showed their starting rating and so their level).
      // Their PIN, this phone's cookie, or the organiser's link does.
      return NextResponse.json({ error: `${existing.name} is already registered. Tap “Already registered?” and enter your PIN.`,
        alreadyRegistered: true }, { status: 409 })
    }

    if (!meta.registrationOpen)
      return NextResponse.json({ error: 'Registration is closed — ask the organiser to add you' }, { status: 403 })

    const playerId = await addPlayer(id, clean, level, { actor: 'player' })
    if (account) await supabaseAdmin.from('live_session_players').update({ player_id: account.id }).eq('id', playerId)
    // Signed in: their account email is proven, so record that. Otherwise the one
    // they typed (linked to an account only once they sign in with it).
    await saveLivePlayerEmail(playerId, account?.email ?? typedEmail, 'player').catch(() => {})
    // Signed-in players don't need a PIN: signing in gets them back anywhere.
    const pin = account ? null : await issuePin(playerId)
    // Shown once: only its hash is kept. The cookie lets this phone (in this
    // browser) straight back in; the PIN covers every other case.
    const res = NextResponse.json({ player_id: playerId, existing: false, pin }, { status: 201 })
    res.cookies.set(playerCookie(id, playerId, new URL(req.url).protocol === 'https:'))
    return res
  } catch (e) {
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
