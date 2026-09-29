import { NextResponse } from 'next/server'
import { staffFromRequest } from '@/lib/staff'
import { leadConsole } from '@/lib/lead'

/** The /lead screen: today's assigned sessions, attendees (first name + initial), live sessions. */
export async function GET(req: Request) {
  const s = await staffFromRequest(req)
  if (!s) return NextResponse.json({ error: 'Sign in with a staff account' }, { status: 401 })
  return NextResponse.json(await leadConsole(s))
}
