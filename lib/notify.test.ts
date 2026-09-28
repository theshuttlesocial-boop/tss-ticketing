import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toE164 } from './notify'

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
