import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLeadWindow, londonToUtc } from './staffWindow';

test('UK times: summer (BST) and winter (GMT)', () => {
  assert.equal(londonToUtc('2026-10-02', '19:00').toISOString(), '2026-10-02T18:00:00.000Z');
  assert.equal(londonToUtc('2026-12-03', '19:00').toISOString(), '2026-12-03T19:00:00.000Z');
});

test('lead window: 3 h before to 6 h after', () => {
  assert.deepEqual(defaultLeadWindow('2026-10-02', '19:00'),
    { valid_from: '2026-10-02T15:00:00.000Z', valid_to: '2026-10-03T00:00:00.000Z' });
});
