import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/staff'
import { assignLead, StaffError, unassignLead } from '@/lib/staffAdmin'

/** Assign a session lead: { staff_id, ticket_session_id } or { staff_id, live_session_id } */
export async function POST(req: Request) {
  const me = await requireOwner(req)
  if (!me || me.via !== 'account') return NextResponse.json({ error: 'Owners only, signed in with their own account' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  try {
    await assignLead(me, b.staff_id, b.ticket_session_id ? { ticket_session_id: b.ticket_session_id } : { live_session_id: b.live_session_id })
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: e instanceof StaffError ? 400 : 500 }) }
}

export async function DELETE(req: Request) {
  const me = await requireOwner(req)
  if (!me || me.via !== 'account') return NextResponse.json({ error: 'Owners only, signed in with their own account' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await unassignLead(me, id)
  return NextResponse.json({ ok: true })
}
