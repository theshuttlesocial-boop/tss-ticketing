import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { addPlayer, updatePlayer, removePlayer, LiveSessionError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }
const LEVELS = ['beginner', 'standard', 'strong'] as const

const fail = (e: unknown) => NextResponse.json(
  { error: (e as Error).message },
  { status: e instanceof LiveSessionError ? 400 : 500 })

export async function POST(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const { name, level } = await req.json()
  if (!LEVELS.includes(level))
    return NextResponse.json({ error: `level must be one of ${LEVELS.join(', ')}` }, { status: 400 })
  try { await addPlayer(id, name, level); return NextResponse.json({ ok: true }, { status: 201 }) }
  catch (e) { return fail(e) }
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const { player_id, name, level } = await req.json()
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  if (level !== undefined && !LEVELS.includes(level))
    return NextResponse.json({ error: `level must be one of ${LEVELS.join(', ')}` }, { status: 400 })
  try { await updatePlayer(id, player_id, { name, level }); return NextResponse.json({ ok: true }) }
  catch (e) { return fail(e) }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const playerId = new URL(req.url).searchParams.get('player_id')
  if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  try { await removePlayer(id, playerId); return NextResponse.json({ ok: true }) }
  catch (e) { return fail(e) }
}
