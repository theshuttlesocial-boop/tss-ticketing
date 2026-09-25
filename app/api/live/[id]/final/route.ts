import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { generateGrandFinal, finishSession, LiveSessionError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  try {
    const r = await generateGrandFinal(id)
    return NextResponse.json(r, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message },
      { status: e instanceof LiveSessionError ? 409 : 500 })
  }
}

/** Close the session so /live/latest stops resolving to it. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  try { await finishSession(id); return NextResponse.json({ ok: true }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
