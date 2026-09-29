import { NextResponse } from 'next/server'
import { leaderboard } from '@/lib/accounts/historyServer'

/** Public: only players who opted in, by first name and last initial. */
export async function GET() {
  return NextResponse.json({ players: await leaderboard() }, { headers: { 'Cache-Control': 's-maxage=60' } })
}
