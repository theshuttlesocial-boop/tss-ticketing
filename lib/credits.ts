import { supabaseAdmin } from '@/lib/supabase'
import { planCreditConsumption } from '@/lib/credits-calc'

// Total unused, unexpired credit for an email (pence). Case-insensitive.
export async function availableCreditPence(emailRaw: string): Promise<number> {
  const email = (emailRaw ?? '').trim().toLowerCase()
  if (!email) return 0
  const { data } = await supabaseAdmin
    .from('credits').select('amount_pence,email')
    .is('used_at', null).gt('expires_at', new Date().toISOString()).ilike('email', email)
  return (data ?? []).filter(c => (c.email ?? '').toLowerCase() === email).reduce((a, c) => a + c.amount_pence, 0)
}

// Consume up to amountPence of credit, soonest-expiry first. Whole credits are
// marked used; the final partial credit is split (reduced in place + a consumed
// clone recorded) so no value is lost. Returns how much was actually consumed.
export async function consumeCredits(emailRaw: string, amountPence: number, bookingId: string): Promise<number> {
  const email = (emailRaw ?? '').trim().toLowerCase()
  if (!email || amountPence <= 0) return 0
  const nowIso = new Date().toISOString()

  const { data } = await supabaseAdmin
    .from('credits').select('id,amount_pence,email,expires_at,source_booking_id')
    .is('used_at', null).gt('expires_at', nowIso).ilike('email', email)
    .order('expires_at', { ascending: true })
  const credits = (data ?? []).filter(c => (c.email ?? '').toLowerCase() === email)

  const plan = planCreditConsumption(credits, amountPence)

  // Guard every write with is('used_at', null) so a concurrent consume can't double-spend.
  for (const id of plan.use) {
    await supabaseAdmin.from('credits').update({ used_at: nowIso, used_booking_id: bookingId }).eq('id', id).is('used_at', null)
  }
  if (plan.split) {
    await supabaseAdmin.from('credits').update({ amount_pence: plan.split.keep }).eq('id', plan.split.id).is('used_at', null)
    await supabaseAdmin.from('credits').insert({
      email, amount_pence: plan.split.take, used_at: nowIso, used_booking_id: bookingId,
      source_booking_id: plan.split.source_booking_id, expires_at: plan.split.expires_at,
    })
  }
  return plan.consumed
}
