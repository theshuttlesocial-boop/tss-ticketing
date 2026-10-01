import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holdSecondsFor } from './holds'

// 18:00 UK time (BST) on Monday 28 Sep 2026 — a release evening.
const now = new Date('2026-09-28T17:00:00Z')

test('waitlist claim on session day: 1 minute', () => {
  assert.equal(holdSecondsFor({ isClaim: true, sessionDate: '2026-09-28', opensAt: null, now }), 60)
})

test('waitlist claim before session day: 5 minutes', () => {
  assert.equal(holdSecondsFor({ isClaim: true, sessionDate: '2026-10-01', opensAt: '2026-09-28T18:15:00Z', now }), 300)
})

test('tickets page on release day: 2 minutes', () => {
  assert.equal(holdSecondsFor({ isClaim: false, sessionDate: '2026-10-01', opensAt: '2026-09-28T18:15:00Z', now }), 120)
})

test('tickets page on any other day: database default (10 minutes)', () => {
  assert.equal(holdSecondsFor({ isClaim: false, sessionDate: '2026-10-01', opensAt: '2026-09-21T18:15:00Z', now }), null)
})

test('session opened manually (no release time): database default', () => {
  assert.equal(holdSecondsFor({ isClaim: false, sessionDate: '2026-10-01', opensAt: null, now }), null)
})

test('release day uses the UK date, not UTC (late-night release in BST)', () => {
  // 23:30 UK on 28 Sep is 22:30 UTC the same day; 00:30 UK on 29 Sep is still 28 Sep in UTC.
  const lateNow = new Date('2026-09-28T23:30:00Z')            // 00:30 UK on 29 Sep
  assert.equal(holdSecondsFor({ isClaim: false, sessionDate: '2026-10-01', opensAt: '2026-09-28T18:15:00Z', now: lateNow }), null)
  assert.equal(holdSecondsFor({ isClaim: false, sessionDate: '2026-10-01', opensAt: '2026-09-28T23:15:00Z', now: lateNow }), 120)
})
