/**
 * Owner-only staff management (Roadmap Phase 5c). Server only. Every change is
 * written to audit_log with who did it.
 */
import { supabaseAdmin } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendStaffInvite } from '@/lib/email';
import type { Role, StaffUser } from '@/lib/staffRules';
import { defaultLeadWindow } from '@/lib/staffWindow';

export class StaffError extends Error {}
const ROLES: Role[] = ['owner', 'admin', 'session_lead'];
const by = (s: StaffUser) => s.email ?? 'emergency password';

export async function listStaff() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const [{ data: staff }, { data: leads }, { data: upcoming }, { data: live }] = await Promise.all([
    supabaseAdmin.from('staff').select('*').order('created_at'),
    supabaseAdmin.from('session_leads').select('*'),
    supabaseAdmin.from('sessions').select('id,title,venue,date,time,status').gte('date', today).order('date').limit(40),
    supabaseAdmin.from('live_sessions').select('id,name,status,created_at').order('created_at', { ascending: false }).limit(15),
  ]);
  const ticketIds = [...new Set((leads ?? []).map((l) => l.ticket_session_id).filter(Boolean))] as string[];
  const { data: assignedTickets } = ticketIds.length
    ? await supabaseAdmin.from('sessions').select('id,title,date,time').in('id', ticketIds) : { data: [] as any[] };
  const title = (l: any) => l.ticket_session_id
    ? (() => { const t = (assignedTickets ?? []).find((x: any) => x.id === l.ticket_session_id); return t ? `${t.title} · ${t.date} ${t.time}` : 'Booking session' })()
    : (live ?? []).find((x) => x.id === l.live_session_id)?.name ?? 'Live session';
  const twoStep = await Promise.all((staff ?? []).map((s) => hasTwoStep(s.email)));
  return {
    staff: (staff ?? []).map((s, i) => ({ ...s, twoStep: twoStep[i], assignments: (leads ?? []).filter((l) => l.staff_id === s.id)
      .map((l) => ({ id: l.id, label: title(l), valid_from: l.valid_from, valid_to: l.valid_to, live: !!l.live_session_id })) })),
    upcoming: (upcoming ?? []).filter((s) => s.status !== 'cancelled'),
    live: live ?? [],
  };
}

async function ownersLeft(exceptId?: string) {
  const { data } = await supabaseAdmin.from('staff').select('id').eq('role', 'owner').eq('active', true);
  return (data ?? []).filter((o) => o.id !== exceptId).length;
}

export async function inviteStaff(actor: StaffUser, email: string, role: Role, sendEmail: boolean) {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new StaffError('Enter a valid email');
  if (!ROLES.includes(role)) throw new StaffError('Pick a role');
  const { data: existing } = await supabaseAdmin.from('staff').select('*').ilike('email', clean).maybeSingle();
  if (existing?.active) throw new StaffError(`${clean} is already on the team as ${existing.role.replace('_', ' ')}`);
  if (existing) {
    await supabaseAdmin.from('staff').update({ role, active: true, revoked_at: null }).eq('id', existing.id);
  } else {
    const { error } = await supabaseAdmin.from('staff').insert({ email: clean, role, created_by: by(actor) });
    if (error) throw new StaffError(error.message);
  }
  await logAudit('staff_invited', { email: clean, role, by: by(actor), emailed: sendEmail }, clean);
  if (sendEmail) await sendStaffInvite({ to: clean, role, invitedBy: actor.email }).catch((e) => console.error('[staff] invite email', e));
}

export async function updateStaff(actor: StaffUser, id: string, patch: { role?: Role; active?: boolean }) {
  const { data: s } = await supabaseAdmin.from('staff').select('*').eq('id', id).maybeSingle();
  if (!s) throw new StaffError('Not found');
  const losingOwner = s.role === 'owner' && s.active && ((patch.role && patch.role !== 'owner') || patch.active === false);
  if (losingOwner && (await ownersLeft(id)) === 0) throw new StaffError('There must always be at least one owner');
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new StaffError('Pick a role');
    await supabaseAdmin.from('staff').update({ role: patch.role }).eq('id', id);
    await logAudit('staff_role_changed', { email: s.email, from: s.role, to: patch.role, by: by(actor) }, s.email);
  }
  if (patch.active !== undefined) {
    await supabaseAdmin.from('staff').update({ active: patch.active, revoked_at: patch.active ? null : new Date().toISOString() }).eq('id', id);
    await logAudit(patch.active ? 'staff_restored' : 'staff_revoked', { email: s.email, role: s.role, by: by(actor) }, s.email);
  }
}

export async function assignLead(actor: StaffUser, staffId: string, target: { ticket_session_id?: string; live_session_id?: string }) {
  const { data: s } = await supabaseAdmin.from('staff').select('email,role').eq('id', staffId).maybeSingle();
  if (!s) throw new StaffError('Not found');
  let window: { valid_from: string | null; valid_to: string | null } = { valid_from: null, valid_to: null };
  let label = 'live session';
  if (target.ticket_session_id) {
    const { data: t } = await supabaseAdmin.from('sessions').select('title,date,time').eq('id', target.ticket_session_id).maybeSingle();
    if (!t) throw new StaffError('Session not found');
    window = defaultLeadWindow(t.date, t.time);
    label = `${t.title} ${t.date} ${t.time}`;
  } else if (target.live_session_id) {
    // A live session already running: from now until 12 hours on.
    window = { valid_from: new Date().toISOString(), valid_to: new Date(Date.now() + 12 * 3600e3).toISOString() };
  } else throw new StaffError('Pick a session');
  const { error } = await supabaseAdmin.from('session_leads').insert({ staff_id: staffId, ...target, ...window });
  if (error) throw new StaffError(error.message);
  await logAudit('lead_assigned', { email: s.email, session: label, ...window, by: by(actor) }, s.email);
}

export async function unassignLead(actor: StaffUser, assignmentId: string) {
  const { data: a } = await supabaseAdmin.from('session_leads').select('staff_id').eq('id', assignmentId).maybeSingle();
  if (!a) return;
  const { data: s } = await supabaseAdmin.from('staff').select('email').eq('id', a.staff_id).maybeSingle();
  await supabaseAdmin.from('session_leads').delete().eq('id', assignmentId);
  await logAudit('lead_unassigned', { email: s?.email, by: by(actor) }, s?.email ?? undefined);
}

/** The audit trail: staff and money events (audit_log) and live-session changes, newest first. */
export async function auditFeed(limit = 150) {
  const [{ data: a }, { data: l }] = await Promise.all([
    supabaseAdmin.from('audit_log').select('event,entity,detail,created_at').order('created_at', { ascending: false }).limit(limit),
    supabaseAdmin.from('live_score_log').select('event,round,court,actor,detail,created_at,session_id,live_sessions(name)')
      .order('created_at', { ascending: false }).limit(limit),
  ]);
  return [
    ...(a ?? []).map((x: any) => ({ at: x.created_at, source: 'site', event: x.event, who: x.detail?.by ?? null, detail: x.detail, entity: x.entity })),
    ...(l ?? []).map((x: any) => ({ at: x.created_at, source: 'live', event: x.event, who: x.actor ?? 'admin',
      detail: { ...x.detail, round: x.round, court: x.court, session: x.live_sessions?.name } })),
  ].sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, limit);
}

/** The sign-in login (auth user) behind a staff email, if they have signed in. */
async function authUserId(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('players').select('auth_user_id').ilike('email', email).maybeSingle();
  return data?.auth_user_id ?? null;
}

async function hasTwoStep(email: string): Promise<boolean> {
  const id = await authUserId(email);
  if (!id) return false;
  const { data } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: id });
  return (data?.factors ?? []).some((f: any) => f.status === 'verified');
}

/** Lost phone: remove someone's authenticator so they set it up again at next sign-in. */
export async function resetTwoStep(actor: StaffUser, staffId: string) {
  const { data: s } = await supabaseAdmin.from('staff').select('email').eq('id', staffId).maybeSingle();
  if (!s) throw new StaffError('Not found');
  const id = await authUserId(s.email);
  if (!id) throw new StaffError(`${s.email} hasn't signed in yet — nothing to reset`);
  const { data } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: id });
  for (const f of data?.factors ?? []) await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
  // Sign them out everywhere, so a stolen phone's session can't carry on
  // (migration 021). The factor is gone either way.
  const { data: ended, error } = await supabaseAdmin.rpc('revoke_user_sessions', { p_user: id });
  await logAudit('staff_mfa_reset', { email: s.email, by: by(actor), sessionsEnded: error ? null : ended }, s.email);
  if (error) throw new StaffError('Two-step was reset, but signing them out everywhere needs migration 021 in Supabase.');
}
