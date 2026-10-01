import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tierWindowMinutes, isTierWindowActive, selectQueueOffers, selectSameDayOffers, isSessionDayLondon, hasLiveOfferConflict, MatchCandidate } from './waitlist-alloc'

const cand = (over: Partial<MatchCandidate>): MatchCandidate => ({
  id: 'c', email: 'a@b.com', groupId: null, position: 1, preferenceRank: 1,
  spacesNeeded: 1, minSpaces: 1, priorSessionCount: 5, ...over,
})

// ── Tier window at all three session-date distances ─────────────────────────
test('tier window: today = 0, tomorrow = 60, 2+ days = 120', () => {
  const now = new Date('2026-09-28T12:00:00Z')
  assert.equal(tierWindowMinutes('2026-09-28', now), 0)   // today
  assert.equal(tierWindowMinutes('2026-09-29', now), 60)  // tomorrow
  assert.equal(tierWindowMinutes('2026-09-30', now), 120) // 2 days
  assert.equal(tierWindowMinutes('2026-10-15', now), 120) // far
})

test('tier window active only within the minutes-from-release window', () => {
  const now = new Date('2026-09-28T12:00:00Z')
  // Session tomorrow -> 60 min window.
  assert.equal(isTierWindowActive('2026-09-29', new Date('2026-09-28T11:30:00Z'), now), true)   // 30 min in
  assert.equal(isTierWindowActive('2026-09-29', new Date('2026-09-28T10:30:00Z'), now), false)  // 90 min in
  // Same-day session -> no tier ever.
  assert.equal(isTierWindowActive('2026-09-28', new Date('2026-09-28T11:59:00Z'), now), false)
})

test('inside the window only new players are offered', () => {
  const cands = [
    cand({ id: 'reg', priorSessionCount: 4, position: 1 }),
    cand({ id: 'new', priorSessionCount: 0, position: 2 }),
  ]
  assert.deepEqual(selectQueueOffers(cands, 1, true).map(o => o.id), ['new'])
})

test('window falls through to everyone when there are no new players', () => {
  assert.deepEqual(selectQueueOffers([cand({ id: 'reg', priorSessionCount: 4 })], 1, true).map(o => o.id), ['reg'])
})

// ── Day before or earlier: strictly waitlist order, one offer per free space ──
test('queue: the first person in line gets the one free space, nobody else is offered', () => {
  const cands = [3, 1, 2].map(n => cand({ id: `c${n}`, position: n }))
  assert.deepEqual(selectQueueOffers(cands, 1, false).map(o => o.id), ['c1'])
})

test('queue: order wins over group size', () => {
  const offers = selectQueueOffers([
    cand({ id: 'small', spacesNeeded: 1, minSpaces: 1, position: 1 }),
    cand({ id: 'big', spacesNeeded: 3, minSpaces: 1, position: 2 }),
  ], 3, false)
  assert.deepEqual(offers.map(o => [o.id, o.claimSpaces]), [['small', 1], ['big', 2]])
})

test('queue: a group of 4 (min 2) is offered 3 when 3 spaces are free', () => {
  const offers = selectQueueOffers([cand({ id: 'grp', spacesNeeded: 4, minSpaces: 2 })], 3, false)
  assert.deepEqual(offers.map(o => [o.id, o.claimSpaces]), [['grp', 3]])
})

test('queue: someone whose minimum does not fit is skipped for the next person', () => {
  const offers = selectQueueOffers([
    cand({ id: 'pair', spacesNeeded: 2, minSpaces: 2, position: 1 }),
    cand({ id: 'single', spacesNeeded: 1, minSpaces: 1, position: 2 }),
  ], 1, false)
  assert.deepEqual(offers.map(o => o.id), ['single'])
})

test('queue: no free spaces (all held by live offers) means no new offers', () => {
  assert.deepEqual(selectQueueOffers([cand({})], 0, false), [])
})

// ── On the day: everyone at once ─────────────────────────────────────────────
test('same day: everyone whose minimum fits is offered at once, in queue order', () => {
  const offers = selectSameDayOffers([
    cand({ id: 'c2', position: 2 }),
    cand({ id: 'pair', position: 1, spacesNeeded: 2, minSpaces: 2 }),
    cand({ id: 'c3', position: 3, spacesNeeded: 3, minSpaces: 1 }),
  ], 1)
  assert.deepEqual(offers.map(o => [o.id, o.claimSpaces]), [['c2', 1], ['c3', 1]])
})

test('session day is judged in UK time', () => {
  // 23:30 UTC on 30 Sep is 00:30 on 1 Oct in London (BST).
  assert.equal(isSessionDayLondon('2026-10-01', new Date('2026-09-30T23:30:00Z')), true)
  assert.equal(isSessionDayLondon('2026-09-30', new Date('2026-09-30T23:30:00Z')), false)
})

// ── Multi-session: claim Thursday, stay active on Friday ────────────────────
// A person waitlisted on both Thu and Fri (same group). While they hold a LIVE
// offer they are blocked from a second simultaneous offer. Once they CLAIM one,
// that row is no longer a live offer, so their other 'waiting' row is eligible.
test('a live offer blocks a second simultaneous offer (by email and by group)', () => {
  const liveEmails = new Set(['dan@b.com'])
  const liveGroups = new Set(['grp-dan'])
  assert.equal(hasLiveOfferConflict({ email: 'dan@b.com', groupId: 'grp-dan' }, liveEmails, liveGroups), true)
  assert.equal(hasLiveOfferConflict({ email: 'DAN@b.com', groupId: null }, liveEmails, liveGroups), true) // case-insensitive email
  assert.equal(hasLiveOfferConflict({ email: 'x@b.com', groupId: 'grp-dan' }, liveEmails, liveGroups), true) // by group
})

test('claiming Thursday leaves the Friday entry eligible (no live offer = no conflict)', () => {
  // After the Thursday row is 'claimed' it is NOT a live offer, so these sets are empty.
  const liveEmails = new Set<string>()
  const liveGroups = new Set<string>()
  const fridayRow = { email: 'dan@b.com', groupId: 'grp-dan' }
  assert.equal(hasLiveOfferConflict(fridayRow, liveEmails, liveGroups), false)
  // ...so the Friday row is a valid candidate for Friday's cascade.
  const offers = selectQueueOffers([cand({ id: 'fri', email: 'dan@b.com', groupId: 'grp-dan' })], 1, false)
  assert.deepEqual(offers.map(o => o.id), ['fri'])
})
