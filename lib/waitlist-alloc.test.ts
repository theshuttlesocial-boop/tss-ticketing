import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tierWindowMinutes, isTierWindowActive, selectOffers, hasLiveOfferConflict, MatchCandidate } from './waitlist-alloc'

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
  const offers = selectOffers(cands, 1, true)
  assert.deepEqual(offers.map(o => o.id), ['new'])
})

test('window falls through to everyone when there are no new players', () => {
  const cands = [cand({ id: 'reg', priorSessionCount: 4 })]
  const offers = selectOffers(cands, 1, true)
  assert.deepEqual(offers.map(o => o.id), ['reg'])
})

// ── Group of 4 with min 2 against 3 open spots ──────────────────────────────
test('a group of 4 (min 2) is offered 3 when 3 spots are open', () => {
  const offers = selectOffers([cand({ id: 'grp', spacesNeeded: 4, minSpaces: 2 })], 3, false)
  assert.equal(offers.length, 1)
  assert.equal(offers[0].claimSpaces, 3)   // LEAST(needed 4, open 3)
  assert.equal(offers[0].isBackup, false)
})

test('a candidate whose minimum cannot be met is skipped', () => {
  // 1 spot open, A wants 1 (min1), B wants 2 (min2). B cannot be satisfied.
  const offers = selectOffers([
    cand({ id: 'A', spacesNeeded: 1, minSpaces: 1, position: 2 }),
    cand({ id: 'B', spacesNeeded: 2, minSpaces: 2, position: 1 }),
  ], 1, false)
  const winner = offers.find(o => !o.isBackup)
  assert.equal(winner?.id, 'A')
})

// ── Ordering: largest allocatable first, then position ──────────────────────
test('larger allocatable group is offered before a smaller one', () => {
  const offers = selectOffers([
    cand({ id: 'small', spacesNeeded: 1, minSpaces: 1, position: 1 }),
    cand({ id: 'big', spacesNeeded: 3, minSpaces: 1, position: 2 }),
  ], 3, false)
  assert.equal(offers[0].id, 'big')
})

test('ties on allocatable size break by queue position', () => {
  const offers = selectOffers([
    cand({ id: 'later', spacesNeeded: 1, minSpaces: 1, position: 5 }),
    cand({ id: 'earlier', spacesNeeded: 1, minSpaces: 1, position: 2 }),
  ], 1, false)
  assert.equal(offers.find(o => !o.isBackup)?.id, 'earlier')
})

// ── Backups ─────────────────────────────────────────────────────────────────
test('adds up to 2 competitive backups beyond the filled set', () => {
  const cands = [1, 2, 3, 4, 5].map(n => cand({ id: `c${n}`, position: n, spacesNeeded: 1, minSpaces: 1 }))
  const offers = selectOffers(cands, 1, false)
  assert.equal(offers.filter(o => !o.isBackup).length, 1)
  assert.equal(offers.filter(o => o.isBackup).length, 2)
  assert.deepEqual(offers.map(o => o.id), ['c1', 'c2', 'c3'])
})

test('no spots open yields no offers', () => {
  assert.deepEqual(selectOffers([cand({})], 0, false), [])
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
  const offers = selectOffers([cand({ id: 'fri', email: 'dan@b.com', groupId: 'grp-dan' })], 1, false)
  assert.deepEqual(offers.map(o => o.id), ['fri'])
})
