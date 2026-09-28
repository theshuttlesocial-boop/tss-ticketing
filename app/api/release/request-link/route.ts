import { NextResponse } from 'next/server'
import { lookupReleasableBookingsByEmail, createReleaseMagicToken } from '@/lib/release-server'
import { allowReleaseLookup, clientIp } from '@/lib/rate-limit'
import { sendReleaseMagicLink } from '@/lib/email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tickets.theshuttlesocial.com'

// Step 1: email a magic link IF the address has an upcoming releasable booking.
// Always returns the same response so we never reveal whether an email exists.
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}))

  const ip = clientIp(req)
  const allowed = await allowReleaseLookup(ip, 5, 15)
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, { status: 429 })

  if (email?.trim()) {
    const bookings = await lookupReleasableBookingsByEmail(email)
    if (bookings.length) {
      const token = await createReleaseMagicToken(email)
      sendReleaseMagicLink({ to: email.trim(), url: `${APP_URL}/release?token=${token}` })
        .catch(err => console.error('[release] magic link email failed:', err))
    }
  }

  // Generic — do not disclose whether a booking was found.
  return NextResponse.json({ sent: true })
}
