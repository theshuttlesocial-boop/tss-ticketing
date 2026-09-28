import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRefundQuote, ADMIN_FEE_PENCE } from './release'

// ── The 0-vs-1-vs-2 card-refund fee ladder (over a 90-day window) ───────────
// The count is binary in effect: 0 prior refunds → free; 1+ → flat 50p/space.

test('0 prior card refunds: full refund, no fee', () => {
  const q = computeRefundQuote(1000, 1, 0)
  assert.equal(q.feePence, 0)
  assert.equal(q.refundPence, 1000)
  assert.equal(q.isFullRefund, true)
})

test('1 prior card refund: 50p fee applies', () => {
  const q = computeRefundQuote(1000, 1, 1)
  assert.equal(q.feePerSpace, ADMIN_FEE_PENCE)
  assert.equal(q.feePence, 50)
  assert.equal(q.refundPence, 950)
  assert.equal(q.isFullRefund, false)
})

test('2 prior card refunds: still the same flat 50p fee (ladder is binary)', () => {
  const q = computeRefundQuote(1000, 1, 2)
  assert.equal(q.feePence, 50)
  assert.equal(q.refundPence, 950)
})

// ── Fee is per released space ───────────────────────────────────────────────
test('fee scales per space when it applies', () => {
  const q = computeRefundQuote(1000, 3, 1)
  assert.equal(q.grossPence, 3000)
  assert.equal(q.feePence, 150)      // 3 × 50p
  assert.equal(q.refundPence, 2850)
})

test('no fee across multiple spaces when player has no prior refunds', () => {
  const q = computeRefundQuote(1000, 3, 0)
  assert.equal(q.feePence, 0)
  assert.equal(q.refundPence, 3000)
  assert.equal(q.isFullRefund, true)
})

// ── Price is read from the booking, never hardcoded ─────────────────────────
test('refund is computed from the real per-space price', () => {
  const q = computeRefundQuote(1250, 2, 1)
  assert.equal(q.grossPence, 2500)
  assert.equal(q.refundPence, 2400)  // 2500 − (2 × 50)
})
