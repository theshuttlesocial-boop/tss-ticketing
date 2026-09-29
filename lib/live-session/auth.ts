/**
 * Live-session access (Roadmap Phase 5): personal staff logins, with the old
 * shared password as an owner-only emergency fallback. See lib/staff.ts.
 */
import { requireAdmin, requireLiveStaff } from '@/lib/staff'

/** Owners and admins. */
export const checkAdmin = async (req: Request) => !!(await requireAdmin(req))

/** Owners, admins, and this session's assigned session leads (inside their time window). */
export const checkLive = async (req: Request, sessionId: string) => !!(await requireLiveStaff(req, sessionId))
