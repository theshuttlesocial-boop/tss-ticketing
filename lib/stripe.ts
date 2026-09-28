import Stripe from 'stripe'
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})
export async function createPaymentIntent({ amountPence, sessionId, holdToken, bookingRef, customerEmail, customerName, extraMetadata }: any) {
  return stripe.paymentIntents.create({
    amount: amountPence, currency: 'gbp', receipt_email: customerEmail,
    metadata: { session_id: sessionId, hold_token: holdToken, booking_ref: bookingRef, customer_name: customerName, ...(extraMetadata ?? {}) },
    // Explicit method list keeps card + Apple Pay + Google Pay (wallets ride on
    // 'card') and Link, and deliberately EXCLUDES Klarna / pay-later methods.
    // (Replaces automatic_payment_methods, which would surface every enabled method.)
    payment_method_types: ['card', 'link'],
  })
}
