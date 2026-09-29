/**
 * Staff roles (Roadmap Phase 5). Pure rules, tested in staffRules.test.ts.
 *
 *   owner         everything, including staff management and the audit log
 *   admin         everything except staff management
 *   session_lead  only the sessions assigned to them, only inside the window
 */
export type Role = 'owner' | 'admin' | 'session_lead';

export interface StaffUser {
  email: string | null;
  role: Role;
  /** 'account' = signed in with their own login; 'password' = the shared emergency password. */
  via: 'account' | 'password';
}

export interface Assignment {
  live_session_id: string | null;
  ticket_session_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export const isAdminRole = (r: Role) => r === 'owner' || r === 'admin';

/** An assignment with no window is valid while it exists; otherwise only between the times given. */
export function assignmentActive(a: Assignment, now: number): boolean {
  if (a.valid_from && Date.parse(a.valid_from) > now) return false;
  if (a.valid_to && Date.parse(a.valid_to) < now) return false;
  return true;
}

/** May this person run this live session (roster, rounds, scores, timer, final)? */
export function canRunLiveSession(s: StaffUser, liveSessionId: string, assignments: Assignment[], now = Date.now()): boolean {
  if (isAdminRole(s.role)) return true;
  return assignments.some((a) => a.live_session_id === liveSessionId && assignmentActive(a, now));
}

/** The shared password still works only as an owner-only emergency fallback, and can be switched off. */
export const passwordFallbackEnabled = (flag: string | undefined) => flag !== 'off';
