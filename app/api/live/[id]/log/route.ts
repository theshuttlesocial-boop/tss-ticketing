import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { readScoreLog } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }

/** Admin-only: every score entry, correction, undo and slot override. */
export async function GET(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  return NextResponse.json(await readScoreLog(id))
}
