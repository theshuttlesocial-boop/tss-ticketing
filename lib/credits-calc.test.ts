import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planCreditConsumption, CreditRow } from './credits-calc'

const c = (id: string, amount: number, expires = '2099-01-01', src: string | null = null): CreditRow =>
  ({ id, amount_pence: amount, expires_at: expires, source_booking_id: src })

test('single credit exactly covers the amount', () => {
  const p = planCreditConsumption([c('a', 800)], 800)
  assert.deepEqual(p.use, ['a'])
  assert.equal(p.split, null)
  assert.equal(p.consumed, 800)
})

test('multiple whole credits are consumed in order', () => {
  const p = planCreditConsumption([c('a', 800), c('b', 800)], 1600)
  assert.deepEqual(p.use, ['a', 'b'])
  assert.equal(p.consumed, 1600)
})

test('a larger credit is split, preserving all value', () => {
  const p = planCreditConsumption([c('a', 1000)], 800)
  assert.deepEqual(p.use, [])
  assert.equal(p.split?.take, 800)
  assert.equal(p.split?.keep, 200)          // no value lost: keep + take == original
  assert.equal((p.split!.keep + p.split!.take), 1000)
  assert.equal(p.consumed, 800)
})

test('never consumes more than the order total', () => {
  const p = planCreditConsumption([c('a', 800), c('b', 800)], 1000)
  assert.deepEqual(p.use, ['a'])            // 800 whole
  assert.equal(p.split?.id, 'b')            // then split 200 of b
  assert.equal(p.split?.take, 200)
  assert.equal(p.consumed, 1000)
})

test('never consumes more than is available (charge stays partly on card)', () => {
  const p = planCreditConsumption([c('a', 800)], 2000)
  assert.deepEqual(p.use, ['a'])
  assert.equal(p.split, null)
  assert.equal(p.consumed, 800)             // only 800 available -> only 800 applied
})

test('whole then split across several credits', () => {
  const p = planCreditConsumption([c('a', 500), c('b', 500), c('d', 500)], 1200)
  assert.deepEqual(p.use, ['a', 'b'])       // 1000 whole
  assert.equal(p.split?.id, 'd')
  assert.equal(p.split?.take, 200)
  assert.equal(p.split?.keep, 300)
  assert.equal(p.consumed, 1200)
})

test('zero / negative amount consumes nothing', () => {
  assert.equal(planCreditConsumption([c('a', 800)], 0).consumed, 0)
  assert.equal(planCreditConsumption([c('a', 800)], -50).consumed, 0)
})

test('the split carries the original expiry and source booking', () => {
  const p = planCreditConsumption([c('a', 1000, '2027-03-01', 'bk_1')], 300)
  assert.equal(p.split?.expires_at, '2027-03-01')
  assert.equal(p.split?.source_booking_id, 'bk_1')
})
