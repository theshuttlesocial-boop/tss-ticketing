import { NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getReleasableBookingForEmail, emailForMagicToken } from '@/lib/release-server'
import { runCascade } from '@/lib/waitlist-matcher'
import { sendReleaseConfirmation } from '@/lib/email'
import { logAudit } from '@/lib/audit'

// Routes B (credit) and C (card). Creates the release, opens the spot to the
// waitlist, and DOES NOT move any money or create any credit here — that only
// happens in settlement when a replacement actually pays (Phase 4).
export async function POST(req: Request) {
  const { bookingId, token, spaces, refundPreference } = await req.json().catch(() => ({}))

  if (refundPreference !== 'credit' && refundPreference !== 'card') {
    return NextResponse.json({ error: 'Choose credit or card.' }, { status: 400 })
  }
  const nSpaces = Number(spaces)
  if (!Number.isInteger(nSpaces) || nSpaces < 1) {
    return NextResponse.json({ error: 'Invalid number of spaces.' }, { status: 400 })
  }

  // The magic-link token proves inbox ownership; resolve the verified email from it.
  const email = await emailForMagicToken(token ?? '')
  if (!email) return NextResponse.json({ error: 'Your link has expired. Please request a new one.' }, { status: 401 })

  // Re-validate server-side that this booking belongs to the verified email.
  const booking = await getReleasableBookingForEmail(bookingId ?? '', email)
  if (!booking) return NextResponse.json({ error: "We couldn't find that booking." }, { status: 404 })
  if (!booking.sessionInFuture) {
    return NextResponse.json({ error: 'This session has already taken place.' }, { status: 400 })
  }
  if (nSpaces > booking.maxReleasable) {
    return NextResponse.json({ error: `You can release at most ${booking.maxReleasable} spot(s).` }, { status: 400 })
  }

  // Atomic guard against over-release / double-release (row lock in-DB).
  const { data: result, error } = await supabaseAdmin.rpc('create_release', {
    p_booking_id: booking.id, p_spaces: nSpaces, p_pref: refundPreference,
  })
  if (error) return NextResponse.json({ error: 'Could not process the release. Please try again.' }, { status: 500 })
  if (!result?.success) {
    const map: Record<string, string> = {
      exceeds_booked: `You can release at most ${result?.max_releasable ?? booking.maxReleasable} spot(s).`,
      not_releasable: 'This booking can no longer be released.',
      booking_not_found: "We couldn't find that booking.",
    }
    return NextResponse.json({ error: map[result?.error] ?? 'Could not process the release.' }, { status: 409 })
  }

  await logAudit('release', { bookingId: booking.id, sessionId: booking.session.id, spaces: nSpaces, refundPreference }, result.release_id)

  // After the response: open the freed spot(s) to the waitlist and send the confirmation.
  // after() keeps the function running until both finish (a bare promise can be cut off
  // when the serverless function stops). A failure never affects the release itself, and
  // the 2-minute cascade job is still there as a safety net.
  after(async () => {
    await Promise.allSettled([
      runCascade(booking.session.id).catch(err => console.error('[release] cascade failed:', err)),
      sendReleaseConfirmation({
        to: booking.email, name: booking.name, bookingRef: booking.booking_ref,
        sessionTitle: booking.session.title, sessionDate: booking.session.date,
        spaces: nSpaces, refundPreference,
      }).catch(err => console.error('[release] confirmation email failed:', err)),
    ])
  })

  return NextResponse.json({ success: true, spaces: nSpaces, refundPreference })
}
