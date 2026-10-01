import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateWaitlistInput as v } from './waitlist-validate'

const good = { name: 'Priya Shah', email: 'priya.shah@gmail.com', phone: '07700 900123' }
const ok = (input: object) => v({ ...good, ...input }).ok
const field = (input: object) => { const r = v({ ...good, ...input }); return 'field' in r ? r.field : null }

// ── Real-world formats that must ALWAYS pass (shapes seen in real bookings) ──
test('UK numbers in every format real customers use pass', () => {
  for (const phone of ['07700900123', '07700 900123', '+447700900123', '+44 7700 900123', '447700900123',
                       '7700900123', '+44 (0)7700 900123', '0044 7700 900123'])
    assert.equal(ok({ phone }), true, phone)
})

test('overseas numbers pass, even typed without +', () => {
  for (const phone of ['+1 415 555 0123', '+91 98765 43210', '81648484', '87575885588'])
    assert.equal(ok({ phone }), true, phone)
})

test('numbers pasted from phone contacts (invisible characters) pass', () => {
  assert.equal(ok({ phone: '‪+44 7700 900123‬' }), true)
  assert.equal(ok({ email: '​priya.shah@gmail.com' }), true)
})

test('ordinary emails pass, including uncommon domains', () => {
  for (const email of ['a.b+tss@gmail.com', 'x@company.co.uk', 'me@club.london', 'Name.Surname@Hotmail.COM'])
    assert.equal(ok({ email }), true, email)
})

test('names with accents, hyphens and apostrophes pass', () => {
  for (const name of ["Siobhán O'Neill", 'Jean-Luc', 'Zoë', '李雷'])
    assert.equal(ok({ name }), true, name)
})

// ── The actual junk entries found on the waitlist must be rejected ───────────
test('every junk entry from the live waitlist is rejected', () => {
  assert.equal(field({ name: 'Test', email: 'Test', phone: '123' }), 'email')
  assert.equal(field({ name: 'Shuttle', email: 'Shuttle1234', phone: '+447985248298' }), 'email')
  assert.equal(field({ name: '$(uuidgen)', email: '$(uuidgen)', phone: '+447985248298' }), 'email')
  assert.equal(field({ name: 'rewtq', email: 'rwqqq@fs.d', phone: '07000000000' }), 'email')
  assert.equal(field({ name: 'a', email: 'a@gmail.com', phone: 'a' }), 'phone')
})

test('missing or empty fields are rejected with the right field', () => {
  assert.equal(field({ name: '' }), 'name')
  assert.equal(field({ name: '   ' }), 'name')
  assert.equal(field({ name: '1234' }), 'name')
  assert.equal(field({ email: '' }), 'email')
  assert.equal(field({ email: 'no-at-sign.com' }), 'email')
  assert.equal(field({ email: 'two words@gmail.com' }), 'email')
  assert.equal(field({ phone: '' }), 'phone')
  assert.equal(field({ phone: '0' }), 'phone')
})

test('a valid sign-up returns trimmed values', () => {
  const r = v({ name: '  Priya   Shah ', email: ' priya.shah@gmail.com ', phone: ' 07700 900123 ' })
  assert.deepEqual(r, { ok: true, name: 'Priya Shah', email: 'priya.shah@gmail.com', phone: '07700 900123' })
})

// ── looksLikeEmail: the same rule reused by live-session registration ───────
import { looksLikeEmail } from './waitlist-validate'
test('looksLikeEmail accepts real addresses and rejects junk', () => {
  for (const e of ['thuriga1004@icloud.com', 'a.b+tss@gmail.com', ' x@club.london ']) assert.equal(looksLikeEmail(e), true, e)
  for (const e of ['', 'Test', 'rwqqq@fs.d', '$(uuidgen)', 'no at.com']) assert.equal(looksLikeEmail(e), false, e)
})
