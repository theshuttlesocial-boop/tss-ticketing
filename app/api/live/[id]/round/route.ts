import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { generateNextRound, undoLastRound, LiveSessionError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  try {
    const { round } = await generateNextRound(id)
    return NextResponse.json({ round }, { status: 201 })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 409 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  try {
    await undoLastRound(id)
    return NextResponse.json({ success: true })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 409 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
