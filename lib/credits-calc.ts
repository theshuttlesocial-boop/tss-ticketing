// Pure planning for credit consumption — no DB/framework deps, so it can be
// unit-tested directly. The DB layer (lib/credits.ts) just executes the plan.

export interface CreditRow {
  id: string
  amount_pence: number
  expires_at: string
  source_booking_id?: string | null
}

export interface ConsumePlan {
  consumed: number                 // total pence actually applied (never > amount, never > available)
  use: string[]                    // credit ids consumed whole
  split: { id: string; keep: number; take: number; expires_at: string; source_booking_id: string | null } | null
}

// Consume up to amountPence from the given credits, in the order provided
// (caller sorts soonest-expiry first). Whole credits are used; the final
// partial credit is split so no value is lost.
export function planCreditConsumption(credits: CreditRow[], amountPence: number): ConsumePlan {
  const target = Math.max(0, Math.floor(amountPence))
  const use: string[] = []
  let split: ConsumePlan['split'] = null
  let remaining = target

  for (const c of credits) {
    if (remaining <= 0) break
    if (c.amount_pence <= remaining) {
      use.push(c.id)
      remaining -= c.amount_pence
    } else {
      split = {
        id: c.id,
        keep: c.amount_pence - remaining,
        take: remaining,
        expires_at: c.expires_at,
        source_booking_id: c.source_booking_id ?? null,
      }
      remaining = 0
    }
  }

  return { consumed: target - remaining, use, split }
}
