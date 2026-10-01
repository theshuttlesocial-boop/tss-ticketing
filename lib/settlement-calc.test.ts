import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFeeAccruingRelease, withinPriorWindow, releasedSpacesTaken } from './settlement-calc'

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

// ── Which paid bookings took a released space (any buyer, not just the waitlist) ──

test('full session, 1 released, nobody has bought it yet: nothing taken', () => {
  // 24 capacity, 23 seats in use after the release, 1 open released space
  assert.equal(releasedSpacesTaken(23, 1, 24, 0), 0)
})

test('full session, 1 released, someone pays for 1: the release is taken', () => {
  assert.equal(releasedSpacesTaken(24, 1, 24, 1), 1)
})

test('a never-sold free seat is used before a released one', () => {
  // 1 seat never sold + 1 released: the first buyer takes the free seat...
  assert.equal(releasedSpacesTaken(23, 1, 24, 1), 0)
  // ...the second takes the released one.
  assert.equal(releasedSpacesTaken(24, 1, 24, 1), 1)
})

test('never more than the booking size or the open released spaces', () => {
  assert.equal(releasedSpacesTaken(26, 3, 24, 2), 2)
  assert.equal(releasedSpacesTaken(30, 1, 24, 4), 1)
})
