import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFeeAccruingRelease, withinPriorWindow } from './settlement-calc'

// ── Only fulfilled card refunds accrue the fee ladder ───────────────────────
test('a fulfilled card refund counts toward the ladder', () => {
  assert.equal(isFeeAccruingRelease({ refund_preference: 'card', outcome: 'replaced' }), true)
})

test('credit releases do NOT count (this is why credit avoids the fee)', () => {
  assert.equal(isFeeAccruingRelease({ refund_preference: 'credit', outcome: 'replaced' }), false)
})

test('a card release that was never filled does not count', () => {
  assert.equal(isFeeAccruingRelease({ refund_preference: 'card', outcome: 'unfilled' }), false)
  assert.equal(isFeeAccruingRelease({ refund_preference: 'card', outcome: null }), false)
})

test('name-change / other preferences never count', () => {
  assert.equal(isFeeAccruingRelease({ refund_preference: 'name_change', outcome: 'replaced' }), false)
})

// ── 90-day window, evaluated as-at the current release ──────────────────────
const before = '2026-06-01T12:00:00Z'

test('a refund 30 days before falls inside the 90-day window', () => {
  assert.equal(withinPriorWindow('2026-05-02T12:00:00Z', before, 90), true)
})

test('a refund 100 days before is outside the window', () => {
  assert.equal(withinPriorWindow('2026-02-21T12:00:00Z', before, 90), false)
})

test('a refund at/after the current release is not "prior"', () => {
  assert.equal(withinPriorWindow(before, before, 90), false)                 // same instant
  assert.equal(withinPriorWindow('2026-06-02T12:00:00Z', before, 90), false) // later
})
