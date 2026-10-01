import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toE164, offerText } from './notify'

test('bare UK national number gets +44 (the existing stored format)', () => {
  assert.equal(toE164('7572341939'), '+447572341939')
})

test('UK number with leading 0 -> +44', () => {
  assert.equal(toE164('07572341939'), '+447572341939')
  assert.equal(toE164('0 7572 341 939'), '+447572341939')
})

test('already +44 is preserved', () => {
  assert.equal(toE164('+447572341939'), '+447572341939')
  assert.equal(toE164('+44 7572 341939'), '+447572341939')
})

test('44-prefixed without + gets +', () => {
  assert.equal(toE164('447572341939'), '+447572341939')
})

test('00 international prefix becomes +', () => {
  assert.equal(toE164('00447572341939'), '+447572341939')
})

test('punctuation and spaces are stripped', () => {
  assert.equal(toE164('(07572) 341-939'), '+447572341939')
})

test('empty / nullish -> null', () => {
  assert.equal(toE164(''), null)
  assert.equal(toE164(null), null)
  assert.equal(toE164(undefined), null)
})

// ── Waitlist offer text message ─────────────────────────────────────────────

const offerVars = {
  sessionDate: '2026-10-02', sessionTime: '20:15', spaces: 1,
  claimUrl: 'https://tickets.theshuttlesocial.com/claim/abcdefghijklmnopqrstuvwxyz123456',
  expiresAt: '2026-10-01T18:40:00Z',   // 19:40 in London (BST)
}

test('offer text (day before): held until a UK time, one link', () => {
  const t = offerText({ ...offerVars, competitive: false })
  assert.match(t, /Fri 2 Oct, 20:15/)
  assert.match(t, /held for you until 19:40/)
  assert.equal(t.split('https://').length - 1, 1)
})

test('offer text (session day): first to pay, and multiple spaces', () => {
  const t = offerText({ ...offerVars, competitive: true, spaces: 2 })
  assert.match(t, /2 spaces opened up/)
  assert.match(t, /first to pay gets it/)
})

test('offer text stays a short message', () => {
  assert.ok(offerText({ ...offerVars, competitive: false }).length <= 200)
})
