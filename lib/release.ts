// Pure helpers for the self-service spot-release flow.
// No framework / DB dependencies so they can be unit-tested directly.

export const ADMIN_FEE_PENCE = 50

export interface RefundQuote {
  spaces: number
  pricePencePerSpace: number
  grossPence: number      // face value of the spaces being released
  feePerSpace: number     // 0 or ADMIN_FEE_PENCE
  feePence: number        // total admin fee across all spaces
  refundPence: number     // what the card would actually be refunded
  isFullRefund: boolean    // true when no admin fee applies
}

// The admin fee is charged per released space, and only once the player has
// already had at least one CARD refund in the trailing 90 days. Credit and
// name-change routes never reach this function, so they never incur the fee.
export function computeRefundQuote(
  pricePencePerSpace: number,
  spaces: number,
  priorCardRefunds: number,
): RefundQuote {
  const feePerSpace = priorCardRefunds >= 1 ? ADMIN_FEE_PENCE : 0
  const grossPence = pricePencePerSpace * spaces
  const feePence = feePerSpace * spaces
  const refundPence = grossPence - feePence
  return {
    spaces,
    pricePencePerSpace,
    grossPence,
    feePerSpace,
    feePence,
    refundPence,
    isFullRefund: feePence === 0,
  }
}
