import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'
import { computeRefundQuote } from '@/lib/release'
import { sendCreditIssued, sendCardRefundIssued } from '@/lib/email'
import { logAudit } from '@/lib/audit'
import { isFeeAccruingRelease, withinPriorWindow } from '@/lib/settlement-calc'

const CREDIT_EXPIRY_DAYS = 90

// Count this email's fulfilled CARD refunds in the 90 days BEFORE a moment,
// excluding a given release. Credits and name-changes never appear here because
// only refund_preference='card' AND outcome='replaced' rows are counted — which
// is exactly why the credit route never accrues the fee ladder.
async function priorCardRefundCount(email: string, beforeIso: string, excludeReleaseId: string): Promise<number> {
  // Bookings for this email (case-insensitive; ilike may over-match, tighten in JS).
  const { data: bookings } = await supabaseAdmin.from('bookings').select('id,email').ilike('email', email)
  const ids = (bookings ?? []).filter(b => (b.email ?? '').toLowerCase() === email.toLowerCase()).map(b => b.id)
  if (!ids.length) return 0
  // Fetch this email's releases and filter with the pure predicates, so the
  // fee-ladder rules (card+replaced only, within window, excluding this one)
  // live in one tested place.
  const { data: rels } = await supabaseAdmin
    .from('releases').select('id,released_at,refund_preference,outcome').in('booking_id', ids)
  return (rels ?? []).filter(r =>
    r.id !== excludeReleaseId &&
    isFeeAccruingRelease(r) &&
    withinPriorWindow(r.released_at, beforeIso, CREDIT_EXPIRY_DAYS),
  ).length
}

// Pay out the releaser once a replacement has paid. Called ONLY from the claim
// success path. Idempotent: an atomic "claim" of resolved_at means duplicate
// webhooks no-op; card refunds also carry a Stripe idempotency key.
export async function settleRelease(releaseId: string): Promise<void> {
  // Atomically take ownership: only the first caller flips resolved_at.
  const { data: claimed } = await supabaseAdmin
    .from('releases')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', releaseId).is('resolved_at', null)
    .select('id,booking_id,spaces,refund_preference,released_at')
    .maybeSingle()
  if (!claimed) { console.log('[settlement] already settled, skipping', releaseId); return }

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id,email,phone,total_pence,quantity,stripe_payment_intent_id,booking_ref')
    .eq('id', claimed.booking_id).single()
  if (!booking) { console.error('[settlement] booking missing for release', releaseId); return }

  const firstName = (booking.email ?? '').split('@')[0]
  const pricePerSpace = Math.round(booking.total_pence / booking.quantity)
  const spaces = claimed.spaces

  if (claimed.refund_preference === 'credit') {
    const amount = pricePerSpace * spaces
    const expiresAt = new Date(Date.now() + CREDIT_EXPIRY_DAYS * 86_400_000).toISOString()
    await supabaseAdmin.from('credits').insert({
      email: (booking.email ?? '').toLowerCase(), phone: booking.phone ?? null,
      amount_pence: amount, source_booking_id: booking.id, expires_at: expiresAt,
    })
    await logAudit('settlement', { releaseId, kind: 'credit', amountPence: amount, email: booking.email }, releaseId)
    sendCreditIssued({ to: booking.email, name: firstName, amountPence: amount, expiresAt, bookingRef: booking.booking_ref })
      .catch(err => console.error('[settlement] credit email failed:', err))
    return
  }

  // Card refund. If there is no PaymentIntent (e.g. the booking was fully paid
  // with store credit), there is no card to refund — issue store credit for the
  // face value instead of emailing a phantom card refund.
  if (!booking.stripe_payment_intent_id) {
    const amount = pricePerSpace * spaces
    const expiresAt = new Date(Date.now() + CREDIT_EXPIRY_DAYS * 86_400_000).toISOString()
    await supabaseAdmin.from('credits').insert({
      email: (booking.email ?? '').toLowerCase(), phone: booking.phone ?? null,
      amount_pence: amount, source_booking_id: booking.id, expires_at: expiresAt,
    })
    const st = spaces >= booking.quantity ? 'refunded' : 'partially_refunded'
    await supabaseAdmin.from('bookings').update({ stripe_status: st }).eq('id', booking.id)
    await logAudit('settlement', { releaseId, kind: 'card_no_pi_credit_fallback', amountPence: amount, email: booking.email }, releaseId)
    sendCreditIssued({ to: booking.email, name: firstName, amountPence: amount, expiresAt, bookingRef: booking.booking_ref })
      .catch(err => console.error('[settlement] fallback credit email failed:', err))
    return
  }

  const priorCard = await priorCardRefundCount(booking.email, claimed.released_at, releaseId)
  const quote = computeRefundQuote(pricePerSpace, spaces, priorCard)

  try {
    if (quote.refundPence > 0) {
      await stripe.refunds.create(
        { payment_intent: booking.stripe_payment_intent_id, amount: quote.refundPence },
        { idempotencyKey: `release-refund-${releaseId}` },
      )
    }
  } catch (err) {
    console.error('[settlement] stripe refund failed (resolved_at set; needs admin retry):', err)
  }

  await supabaseAdmin.from('releases').update({ admin_fee_pence: quote.feePence }).eq('id', releaseId)
  // Fully released -> refunded; some spaces kept -> partially_refunded (still occupies seats).
  const newStatus = spaces >= booking.quantity ? 'refunded' : 'partially_refunded'
  await supabaseAdmin.from('bookings').update({ stripe_status: newStatus }).eq('id', booking.id)

  await logAudit('settlement', { releaseId, kind: 'card', amountPence: quote.refundPence, feePence: quote.feePence, email: booking.email }, releaseId)
  sendCardRefundIssued({ to: booking.email, name: firstName, amountPence: quote.refundPence, feePence: quote.feePence, bookingRef: booking.booking_ref })
    .catch(err => console.error('[settlement] refund email failed:', err))
}
