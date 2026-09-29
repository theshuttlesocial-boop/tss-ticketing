import { NextResponse } from 'next/server'
import { ensurePlayer, userFromRequest } from '@/lib/account'
import { exportMyData } from '@/lib/accounts/exportData'

/** Download my data (UK GDPR right of access), as a JSON file. */
export async function GET(req: Request) {
  const u = await userFromRequest(req)
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const p = await ensurePlayer(u)
  const body = JSON.stringify(await exportMyData(p), null, 2)
  return new NextResponse(body, { headers: {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="tss-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
    'Cache-Control': 'no-store',
  } })
}
