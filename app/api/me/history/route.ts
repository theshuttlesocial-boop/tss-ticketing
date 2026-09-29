import { NextResponse } from 'next/server'
import { ensurePlayer, userFromRequest } from '@/lib/account'
import { loadHistory } from '@/lib/accounts/historyServer'

/** Your games, partners and opponents across every live session you joined while signed in. */
export async function GET(req: Request) {
  const u = await userFromRequest(req)
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  try {
    const me = await ensurePlayer(u)
    return NextResponse.json({ history: await loadHistory(me), leaderboard: me.leaderboard_opt_in })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
