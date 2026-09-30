import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveSessionStatus } from './schedule'

const now = new Date('2026-09-30T12:00:00Z')
const past = '2026-09-28T19:15:00Z'
const future = '2026-10-05T19:15:00Z'

test('draft with a past opens_at is promoted to open', () => {
  assert.equal(effectiveSessionStatus('draft', past, now), 'open')
})

test('draft with a future opens_at stays draft (still coming soon)', () => {
  assert.equal(effectiveSessionStatus('draft', future, now), 'draft')
})

test('draft with no opens_at stays draft', () => {
  assert.equal(effectiveSessionStatus('draft', null, now), 'draft')
  assert.equal(effectiveSessionStatus(undefined, undefined, now), 'draft')
})

test('already-open stays open', () => {
  assert.equal(effectiveSessionStatus('open', past, now), 'open')
  assert.equal(effectiveSessionStatus('open', null, now), 'open')
})

test('closed / cancelled are never promoted, even with a past opens_at', () => {
  assert.equal(effectiveSessionStatus('closed', past, now), 'closed')
  assert.equal(effectiveSessionStatus('cancelled', past, now), 'cancelled')
})
