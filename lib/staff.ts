/**
 * Who is calling an admin API, and what may they do? Server only.
 *
 * A staff member signs in with their own emailed code (Supabase Auth) and
 * sends `Authorization: Bearer <token>`; their role comes from the `staff`
 * table by email. The old shared password (x-admin-secret = ADMIN_SECRET)
 * still works as an OWNER-ONLY emergency fallback until ADMIN_SECRET_FALLBACK
 * is set to "off".
 */
import { supabaseAdmin } from '@/lib/supabase';
import { userFromRequest } from '@/lib/account';
import { Assignment, canRunLiveSession, fullySignedIn, isAdminRole, needsTwoStep, passwordFallbackEnabled, Role, StaffUser, tokenAal } from './staffRules';

export type { Role, StaffUser };

export async function staffFromRequest(req: Request): Promise<StaffUser | null> {
  const secret = req.headers.get('x-admin-secret');
  if (secret && process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET
      && passwordFallbackEnabled(process.env.ADMIN_SECRET_FALLBACK)) {
    return { email: null, role: 'owner', via: 'password' };
  }
  const u = await userFromRequest(req);
  if (!u) return null;
  const token = (req.headers.get('authorization') ?? '').slice(7).trim();
  const { data, error } = await supabaseAdmin.from('staff').select('email,role,active').ilike('email', u.email).maybeSingle();
  if (error || !data || !data.active) return null;
  const role = data.role as Role;
  return { email: u.email, role, via: 'account',
    mfa: needsTwoStep(role) ? (tokenAal(token) === 'aal2' ? 'ok' : 'needed') : 'ok' };
}

/** Owners and admins: bookings, refunds, credits, emails, analytics, settings, any live session. */
export async function requireAdmin(req: Request): Promise<StaffUser | null> {
  const s = await staffFromRequest(req);
  return s && isAdminRole(s.role) && fullySignedIn(s) ? s : null;
}

/** Owners only: staff management and the full audit log. */
export async function requireOwner(req: Request): Promise<StaffUser | null> {
  const s = await staffFromRequest(req);
  return s && s.role === 'owner' && fullySignedIn(s) ? s : null;
}

/** Anyone allowed to run this live session: owners, admins, and its assigned session leads (in their window). */
export async function requireLiveStaff(req: Request, liveSessionId: string): Promise<StaffUser | null> {
  const s = await staffFromRequest(req);
  if (!s || !fullySignedIn(s)) return null;
  if (isAdminRole(s.role)) return s;
  const { data: me } = await supabaseAdmin.from('staff').select('id').ilike('email', s.email ?? '').maybeSingle();
  if (!me) return null;
  const { data } = await supabaseAdmin.from('session_leads')
    .select('live_session_id,ticket_session_id,valid_from,valid_to').eq('staff_id', me.id);
  return canRunLiveSession(s, liveSessionId, (data ?? []) as Assignment[]) ? s : null;
}
