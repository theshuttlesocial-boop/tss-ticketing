import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import {
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
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
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
 *   rejoin: true          — bring back someone who left
 *   leave: true, substitute?: { player_id } | { name, level }, force?
 */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
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
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const playerId = new URL(req.url).searchParams.get('player_id')
  if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  try { await removePlayer(id, playerId); return NextResponse.json({ ok: true }) }
  catch (e) { return fail(e) }
}
