import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/staff'
import { auditFeed, inviteStaff, listStaff, StaffError, updateStaff } from '@/lib/staffAdmin'

const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof StaffError ? 400 : 500 })

/** Owners only: the team, assignments, sessions to assign, and the audit log. */
export async function GET(req: Request) {
  if (!(await requireOwner(req))) return NextResponse.json({ error: 'Owners only' }, { status: 403 })
  const [team, audit] = await Promise.all([listStaff(), auditFeed()])
  return NextResponse.json({ ...team, audit })
}

/** Invite: { email, role, sendEmail } */
export async function POST(req: Request) {
  const me = await requireOwner(req)
  if (!me) return NextResponse.json({ error: 'Owners only' }, { status: 403 })
  if (me.via !== 'account') return NextResponse.json({ error: 'Sign in with your own owner account to manage staff (not the emergency password)' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  try { await inviteStaff(me, String(b.email ?? ''), b.role, b.sendEmail !== false); return NextResponse.json({ ok: true }) }
  catch (e) { return fail(e) }
}

/** Change role or remove/restore access: { id, role? , active? } */
export async function PATCH(req: Request) {
  const me = await requireOwner(req)
  if (!me) return NextResponse.json({ error: 'Owners only' }, { status: 403 })
  if (me.via !== 'account') return NextResponse.json({ error: 'Sign in with your own owner account to manage staff' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  try { await updateStaff(me, b.id, { role: b.role, active: typeof b.active === 'boolean' ? b.active : undefined }); return NextResponse.json({ ok: true }) }
  catch (e) { return fail(e) }
}
