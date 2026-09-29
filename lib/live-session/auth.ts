/**
 * Live-session access (Roadmap Phase 5): personal staff logins, with the old
 * shared password as an owner-only emergency fallback. See lib/staff.ts.
 */
import { requireAdmin, requireLiveStaff, StaffUser } from '@/lib/staff'
import { setActor } from '@/lib/actor'

/** Owners and admins. */
export const checkAdmin = async (req: Request) => allowed(await requireAdmin(req))

/** Owners, admins, and this session's assigned session leads (inside their time window). */
export const checkLive = async (req: Request, sessionId: string) => requireLiveStaff(req, sessionId)

/**
 * Sync on purpose: called in the route itself, after the check, so the
 * staff member is remembered for the rest of that request and every change-log
 * entry records who made it (an async helper can't pass this back up).
 */
export function allowed(s: StaffUser | null): boolean {
  if (s) setActor(s.email ?? 'emergency password')
  return !!s
}
