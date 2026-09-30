import { NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createPaymentIntent, stripe } from '@/lib/stripe'
import { nanoid } from 'nanoid'
import { availableCreditPence, consumeCredits } from '@/lib/credits'
import { sendBookingConfirmation, sendAdminBookingNotification } from '@/lib/email'
import { logAudit } from '@/lib/audit'
import { userFromRequest } from '@/lib/account'
import { getWelcomeSettings, normaliseCode } from '@/lib/welcome'

export async function POST(req: Request) {
  const body = await req.json()
  const { session_id, name, email, phone, additional_attendees, claim_token } = body
  let quantity = body.quantity

  // ── Waitlist claim: validate the live offer and size the order from it ──────
  let waitlistId: string | null = null
  if (claim_token) {
    const { data: offer } = await supabaseAdmin.from('waitlist')
      .select('id,session_id,claim_spaces,claim_expires_at,status')
      .eq('claim_token', claim_token).maybeSingle()
    if (!offer || offer.status !== 'offered' || offer.session_id !== session_id
        || !offer.claim_expires_at || new Date(offer.claim_expires_at) < new Date()) {
      return NextResponse.json({ error: 'offer_expired' }, { status: 409 })
    }
    waitlistId = offer.id
    quantity = offer.claim_spaces ?? 1   // authoritative: size the order from the offer
    logAudit('claim_attempt', { waitlistId, sessionId: session_id, spaces: quantity }, offer.id).catch(() => {})
  }

  if (!session_id || !quantity || !name || !email || !phone)
    return NextResponse.json({ error: 'All fields including phone are required' }, { status: 400 })

  if (quantity < 1 || quantity > 10)
    return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })

  if (quantity > 1 && (!additional_attendees || additional_attendees.length < quantity - 1) && !claim_token)
    return NextResponse.json({ error: 'Please provide names for all additional attendees' }, { status: 400 })

  // ── Blocklist check ──────────────────────────────────────────────────────────
  const { data: blockedEntry } = await supabaseAdmin
    .from('blocked_emails')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (blockedEntry) {
    return NextResponse.json({ error: "We're unable to complete your booking. Please contact an admin for assistance." }, { status: 400 })
  }

  // ── Dedup: return existing PaymentIntent if same email+session booked in last 10 min ──
  // Prevents double-charging if user taps "Continue" twice or retries after Apple Pay glitch
  const dedupeWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: existingBooking } = await supabaseAdmin
    .from('bookings')
    .select('stripe_payment_intent_id, booking_ref, total_pence, created_at')
    .eq('session_id', session_id)
    .eq('email', email)
    .eq('quantity', quantity)
    .eq('stripe_status', 'pending')
    .gte('created_at', dedupeWindow)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingBooking?.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(existingBooking.stripe_payment_intent_id)
      // Only reuse if still in a payable state (not already succeeded/cancelled)
      if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation' || pi.status === 'requires_action') {
        const holdToken = pi.metadata?.hold_token
        let expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString()
        if (holdToken) {
          const { data: hold } = await supabaseAdmin
            .from('seat_holds').select('expires_at').eq('hold_token', holdToken).single()
          if (hold?.expires_at) expiresAt = hold.expires_at
        }
        console.log('[book] dedup: returning existing PI for', email, session_id)
        return NextResponse.json({
          clientSecret: pi.client_secret, holdToken, bookingRef: existingBooking.booking_ref,
          expiresAt, totalPence: existingBooking.total_pence,
        })
      }
    } catch (e) {
      // If PI retrieval fails, fall through and create a fresh one
      console.warn('[book] dedup PI retrieval failed, creating fresh:', e)
    }
  }

  const holdToken  = nanoid(24)
  const bookingRef = 'TSS-' + nanoid(5).toUpperCase()

  const { data: holdResult, error: holdError } = await supabaseAdmin.rpc('claim_seat_hold', {
    p_session_id: session_id, p_quantity: quantity, p_hold_token: holdToken,
  })

  if (holdError) return NextResponse.json({ error: 'Could not process request' }, { status: 500 })
  if (!holdResult.success) return NextResponse.json({ error: holdResult.error, available: holdResult.available ?? 0 }, { status: 409 })

  const { data: session } = await supabaseAdmin.from('sessions').select('price_pence, title, label, date, time, venue, description, max_tickets_per_order').eq('id', session_id).single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const maxPerOrder = session.max_tickets_per_order ?? 4
  if (!claim_token && quantity > maxPerOrder)   // a waitlist offer is already sized; skip the per-order cap
    return NextResponse.json({ error: `Max ${maxPerOrder} tickets per order` }, { status: 400 })

  const totalPence = session.price_pence * quantity

  // ── Welcome discount (Phase 8): money off someone's first booking ─────────────
  // The code comes from /welcome (?code=…). claim_welcome() (migration 026) checks the
  // email has never paid for a booking or used the offer, and holds it under a lock.
  let welcomePence = 0
  let welcomeNote: string | null = null
  const promo = normaliseCode(body.promo_code)
  if (promo && !claim_token) {
    const w = await getWelcomeSettings()
    if (w.enabled && w.discountPence > 0 && promo === w.code) {
      const amount = Math.min(w.discountPence, totalPence)
      const { data: ok, error: wErr } = await supabaseAdmin.rpc('claim_welcome', {
        p_email: email, p_booking_ref: bookingRef, p_amount: amount, p_code: promo,
        p_src: String(body.src ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || null,
      })
      if (!wErr && ok) welcomePence = amount
      else welcomeNote = 'The welcome offer is for your first booking only, so it wasn’t applied this time.'
    } else {
      welcomeNote = 'That offer code isn’t active any more, so it wasn’t applied.'
    }
  }
  const releaseWelcomeHold = () => welcomePence > 0
    ? supabaseAdmin.from('welcome_redemptions').delete().eq('booking_ref', bookingRef).eq('status', 'held').then(() => {}, () => {})
    : Promise.resolve()
  const orderPence = totalPence - welcomePence   // what the order costs after the welcome discount

  // ── Credit redemption (not for waitlist claims) ─────────────────────────────
  // Apply available credit to reduce (or fully cover) the charge. Never negative,
  // never more than the order total.
  // Only the owner of the email can spend its credit: the booker must be signed in
  // with that same email. Otherwise the booking goes ahead at full price.
  let creditToApply = 0
  if (!claim_token && body.apply_credit) {
    const u = await userFromRequest(req)
    const sameEmail = !!u && u.email.trim().toLowerCase() === String(email ?? '').trim().toLowerCase()
    if (sameEmail) {
      // Set the credit aside under a per-email lock (migration 025), so two bookings at
      // the same moment can't both spend it. Without the migration: the old read-only check.
      const { data: held, error: holdErr } = await supabaseAdmin.rpc('hold_credit', { p_email: email, p_want: orderPence, p_booking_ref: bookingRef })
      creditToApply = holdErr ? Math.min(await availableCreditPence(email), orderPence) : Math.max(0, Number(held) || 0)
    }
  }
  const releaseCreditHold = () => creditToApply > 0
    ? supabaseAdmin.from('credit_holds').delete().eq('booking_ref', bookingRef).then(() => {}, () => {})
    : Promise.resolve()
  const chargePence = orderPence - creditToApply

  // Full cover: no Stripe. Create the booking as succeeded, consume credit, email.
  if (chargePence <= 0 && (creditToApply > 0 || welcomePence > 0)) {
    const additionalJson = additional_attendees ? JSON.stringify(additional_attendees) : null
    const { data: newBooking, error: insErr } = await supabaseAdmin.from('bookings').insert({
      session_id, name, email, phone: phone ?? null,
      quantity, total_pence: orderPence, stripe_status: 'succeeded', booking_ref: bookingRef,
      additional_attendees: additionalJson,
    }).select('id').single()
    if (insErr) {
      await supabaseAdmin.from('seat_holds').delete().eq('hold_token', holdToken)
      await releaseCreditHold()
      await releaseWelcomeHold()
      // Capacity trigger or other failure.
      return NextResponse.json({ error: 'Could not complete booking' }, { status: 409 })
    }
    if (creditToApply > 0) await consumeCredits(email, creditToApply, newBooking.id)
    await releaseCreditHold()
    if (welcomePence > 0) await supabaseAdmin.from('welcome_redemptions').update({ status: 'redeemed', redeemed_at: new Date().toISOString() }).eq('booking_ref', bookingRef)
    await supabaseAdmin.from('seat_holds').update({ used: true }).eq('hold_token', holdToken)

    const extras = additional_attendees ? additional_attendees.map((a: any) => a.name ?? a) : undefined
    // after(): the emails finish sending even though the response has already gone.
    after(() => Promise.allSettled([
      sendBookingConfirmation({
        to: email, name, bookingRef, sessionTitle: session.title, sessionLabel: session.label,
        sessionDate: session.date, sessionTime: session.time, venue: session.venue,
        description: session.description, quantity, totalPence: orderPence, additionalAttendees: extras,
      }).catch(err => console.error('[book] confirmation email failed:', err)),
      sendAdminBookingNotification({
        name, email, phone: phone ?? undefined, bookingRef, sessionTitle: session.title,
        sessionDate: session.date, sessionTime: session.time, venue: session.venue, quantity, totalPence: orderPence,
        additionalAttendees: extras,
      }).catch(err => console.error('[book] admin email failed:', err)),
    ]).then(() => {}))

    return NextResponse.json({ fullyCovered: true, bookingRef, creditApplied: creditToApply, welcomePence, welcomeNote, totalPence })
  }

  let paymentIntent
  try {
    paymentIntent = await createPaymentIntent({
      amountPence: chargePence, sessionId: session_id, holdToken, bookingRef,
      customerEmail: email, customerName: name,
      extraMetadata: {
        ...(waitlistId ? { waitlist_id: waitlistId, claim: 'true' } : {}),
        ...(creditToApply > 0 ? { credit_applied: String(creditToApply) } : {}),
        ...(welcomePence > 0 ? { welcome_pence: String(welcomePence) } : {}),
      },
    })
  } catch (err: any) {
    await supabaseAdmin.from('seat_holds').delete().eq('hold_token', holdToken)
    await releaseCreditHold()
    await releaseWelcomeHold()
    return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 })
  }

  await supabaseAdmin.from('bookings').insert({
    session_id, name, email, phone: phone ?? null,
    quantity, total_pence: orderPence,   // after any welcome discount; credit still counts as paid
    stripe_payment_intent_id: paymentIntent.id,
    stripe_status: 'pending',
    booking_ref: bookingRef,
    additional_attendees: additional_attendees ? JSON.stringify(additional_attendees) : null,
  })

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret, holdToken, bookingRef,
    expiresAt: holdResult.expires_at, totalPence, chargePence, creditApplied: creditToApply, welcomePence, welcomeNote,
  })
}
