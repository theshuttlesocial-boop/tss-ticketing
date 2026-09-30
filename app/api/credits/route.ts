import { NextResponse } from 'next/server'
import { availableCreditPence } from '@/lib/credits'
import { userFromRequest } from '@/lib/account'

/**
 * Your own credit balance. Signed-in players only, and only for the email you're
 * signed in with: a balance is never shown for an email someone has just typed in.
 */
export async function GET(req: Request) {
  const u = await userFromRequest(req)
  if (!u) return NextResponse.json({ availablePence: 0, signedIn: false })
  return NextResponse.json({ availablePence: await availableCreditPence(u.email), signedIn: true, email: u.email })
}
