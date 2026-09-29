import { NextResponse } from 'next/server'
import { checkLive } from '@/lib/live-session/auth'
import { issuePin } from '@/lib/live-session/pinServer'
import { supabaseAdmin } from '@/lib/supabase'
import {
  logEvent,
  loadSession,
  addPlayer, updatePlayer, removePlayer, rejoinPlayer, withdrawPlayer, correctStartLevel, setLevelLock,
  LiveSessionError, NeedsConfirmError,
} from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }
const LEVELS = ['beginner', 'standard', 'intermediate', 'strong'] as const
const isLevel = (l: unknown): l is (typeof LEVELS)[number] => LEVELS.includes(l as any)

const fail = (e: unknown) => NextResponse.json(
  { error: (e as Error).message, ...(e instanceof NeedsConfirmError ? { needsConfirm: true } : {}) },
  { status: e instanceof NeedsConfirmError ? 409 : e instanceof LiveSessionError ? 400 : 500 })

export async function POST(req: Request, { params }: Ctx) {
  if (!(await checkLive(req, (await params).id))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const { name, level } = await req.json()
  if (!isLevel(level))
    return NextResponse.json({ error: `level must be one of ${LEVELS.join(', ')}` }, { status: 400 })
  try { await addPlayer(id, name, level); return NextResponse.json({ ok: true }, { status: 201 }) }
  catch (e) { return fail(e) }
}

/**
 * One player. Body is { player_id } plus one of:
 *   name / level          — rename; change level from the next round
 *   start_level, preview  — correct the starting level (preview = impact only)
 *   locked                — lock the level against automatic review
 *   newPin: true          — issue a new PIN (returned once)
 *   rejoin: true          — bring back someone who left
 *   leave: true, substitute?: { player_id } | { name, level }, force?
 */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await checkLive(req, (await params).id))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const b = await req.json()
  if (!b.player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  try {
    if (b.rejoin === true) { await rejoinPlayer(id, b.player_id); return NextResponse.json({ ok: true }) }
    if (b.leave === true) {
      const sub = b.substitute
      if (sub && !('player_id' in sub) && !(typeof sub.name === 'string' && isLevel(sub.level)))
        return NextResponse.json({ error: 'a new substitute needs a name and a level' }, { status: 400 })
      await withdrawPlayer(id, b.player_id, sub ?? undefined, { force: b.force === true })
      return NextResponse.json({ ok: true })
    }
    if (typeof b.linkEmail === 'string' || b.unlink === true) {
      // Attach a past name-only entry (e.g. Session 89) to someone's account,
      // so it shows in their history. They must have signed in once.
      const s = await loadSession(id)
      if (!s.players[b.player_id]) return NextResponse.json({ error: 'player not in this session' }, { status: 400 })
      let accountId: string | null = null
      if (!b.unlink) {
        const { data: acct } = await supabaseAdmin.from('players').select('id').ilike('email', b.linkEmail.trim()).maybeSingle()
        if (!acct) return NextResponse.json({ error: 'No account with that email. Ask them to sign in once at /account, then try again.' }, { status: 404 })
        const { data: taken } = await supabaseAdmin.from('live_session_players').select('id,name')
          .eq('session_id', id).eq('player_id', acct.id).neq('id', b.player_id).maybeSingle()
        if (taken) return NextResponse.json({ error: `That account is already linked to ${taken.name} in this session.` }, { status: 409 })
        accountId = acct.id
      }
      const { error } = await supabaseAdmin.from('live_session_players').update({ player_id: accountId }).eq('id', b.player_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logEvent({ session_id: id, event: 'attention', player_id: b.player_id,
        detail: { text: `${s.players[b.player_id].name} ${accountId ? 'linked to an account' : 'unlinked from their account'}` } })
      return NextResponse.json({ ok: true, linked: !!accountId })
    }
    if (b.newPin === true) {
      // For someone the organiser added (no PIN), or who has forgotten theirs.
      // Shown to the organiser once; the old PIN stops working.
      const s = await loadSession(id)
      if (!s.players[b.player_id]) return NextResponse.json({ error: 'player not in this session' }, { status: 400 })
      const pin = await issuePin(b.player_id)
      if (!pin) return NextResponse.json({ error: 'Run migration 013 in Supabase to turn on PINs' }, { status: 503 })
      await logEvent({ session_id: id, event: 'pin_reset', player_id: b.player_id, detail: { name: s.players[b.player_id].name } })
      return NextResponse.json({ pin })
    }
    if (typeof b.locked === 'boolean') { await setLevelLock(id, b.player_id, b.locked); return NextResponse.json({ ok: true }) }
    if (b.start_level !== undefined) {
      if (!isLevel(b.start_level)) return NextResponse.json({ error: 'invalid level' }, { status: 400 })
      return NextResponse.json(await correctStartLevel(id, b.player_id, b.start_level, b.preview === true))
    }
    if (b.level !== undefined && !isLevel(b.level))
      return NextResponse.json({ error: `level must be one of ${LEVELS.join(', ')}` }, { status: 400 })
    await updatePlayer(id, b.player_id, { name: b.name, level: b.level })
    return NextResponse.json({ ok: true })
  } catch (e) { return fail(e) }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await checkLive(req, (await params).id))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const playerId = new URL(req.url).searchParams.get('player_id')
  if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  try { await removePlayer(id, playerId); return NextResponse.json({ ok: true }) }
  catch (e) { return fail(e) }
}
