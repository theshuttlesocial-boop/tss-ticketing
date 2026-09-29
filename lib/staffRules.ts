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
  /** Owners and admins must also pass the authenticator-app step (Phase 5d). */
  mfa?: 'ok' | 'needed';
}

export interface Assignment {
  live_session_id: string | null;
  ticket_session_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export const isAdminRole = (r: Role) => r === 'owner' || r === 'admin';

/** Owners and admins need two-step login; session leads don't. */
export const needsTwoStep = (r: Role) => isAdminRole(r);

/**
 * The sign-in's assurance level, read from the access token Supabase has
 * already verified: 'aal2' once the authenticator code has been entered.
 */
export function tokenAal(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch { return null; }
}

/** Has this staff member done everything their role requires to act? */
export const fullySignedIn = (s: StaffUser) => s.via === 'password' || !needsTwoStep(s.role) || s.mfa === 'ok';

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
