import { NextResponse } from 'next/server'
import { staffFromRequest } from '@/lib/staff'

/** Who am I as staff? Used by the admin pages to show the role and route session leads to /lead. */
export async function GET(req: Request) {
  const s = await staffFromRequest(req)
  if (!s) return NextResponse.json({ staff: null }, { status: 401 })
  return NextResponse.json({ staff: s })
}
