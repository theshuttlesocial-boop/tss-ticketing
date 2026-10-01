import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/staff'
import { attendanceFor } from '@/lib/attendance'

/** Who attended a session (registered in its live session), with emails. Owners and admins. */
export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('session_id')
  if (!id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  const all = await attendanceFor([id], true)
  if (!all) return NextResponse.json({ ready: false, attendees: [], hasLiveSession: false })
  return NextResponse.json({ ready: true, attendees: all[id].attendees, hasLiveSession: all[id].liveSessionIds.length > 0 })
}
