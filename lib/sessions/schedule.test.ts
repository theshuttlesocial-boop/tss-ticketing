import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseScheduledStatus } from './schedule'

const now = new Date('2026-09-30T12:00:00Z')
const past = '2026-09-28T19:15:00Z'
const future = '2026-10-05T19:15:00Z'

test('draft with a past opens_at is promoted to open', () => {
  assert.equal(normaliseScheduledStatus('draft', past, now), 'open')
})

test('draft with a future opens_at stays draft (still coming soon)', () => {
  assert.equal(normaliseScheduledStatus('draft', future, now), 'draft')
})

test('draft with no opens_at stays draft', () => {
  assert.equal(normaliseScheduledStatus('draft', null, now), 'draft')
  assert.equal(normaliseScheduledStatus(undefined, undefined, now), 'draft')
})

test('already-open stays open', () => {
  assert.equal(normaliseScheduledStatus('open', past, now), 'open')
  assert.equal(normaliseScheduledStatus('open', null, now), 'open')
})

test('closed / cancelled are never promoted, even with a past opens_at', () => {
  assert.equal(normaliseScheduledStatus('closed', past, now), 'closed')
  assert.equal(normaliseScheduledStatus('cancelled', past, now), 'cancelled')
})
