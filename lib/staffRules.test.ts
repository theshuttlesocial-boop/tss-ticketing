import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentActive, canRunLiveSession, isAdminRole, passwordFallbackEnabled, StaffUser } from './staffRules';

const T = Date.parse('2026-10-02T19:00:00Z');
const lead: StaffUser = { email: 'lead@x.com', role: 'session_lead', via: 'account' };
const admin: StaffUser = { email: 'a@x.com', role: 'admin', via: 'account' };

test('roles: owners and admins are admins; leads are not', () => {
  assert.ok(isAdminRole('owner') && isAdminRole('admin') && !isAdminRole('session_lead'));
});

test('session lead: only their session, only inside the window', () => {
  const tonight = { live_session_id: 'S1', ticket_session_id: null, valid_from: '2026-10-02T17:00:00Z', valid_to: '2026-10-02T23:30:00Z' };
  assert.ok(canRunLiveSession(lead, 'S1', [tonight], T));
  assert.ok(!canRunLiveSession(lead, 'S2', [tonight], T), 'not someone else’s session');
  assert.ok(!canRunLiveSession(lead, 'S1', [tonight], Date.parse('2026-10-03T09:00:00Z')), 'not the next morning');
  assert.ok(!canRunLiveSession(lead, 'S1', [tonight], Date.parse('2026-10-02T12:00:00Z')), 'not before it opens');
  assert.ok(!canRunLiveSession(lead, 'S1', [], T), 'no assignment, no access');
  assert.ok(canRunLiveSession(admin, 'S2', [], T), 'admins run any session');
});

test('assignment without a window lasts until removed', () => {
  assert.ok(assignmentActive({ live_session_id: 'S1', ticket_session_id: null, valid_from: null, valid_to: null }, T));
});

test('emergency password: on unless switched off', () => {
  assert.ok(passwordFallbackEnabled(undefined));
  assert.ok(passwordFallbackEnabled('on'));
  assert.ok(!passwordFallbackEnabled('off'));
});
