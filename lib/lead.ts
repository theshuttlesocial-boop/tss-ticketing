/**
 * Session-lead console data (Roadmap Phase 5b). Server only.
 *
 * A session lead sees only the sessions assigned to them, inside the
 * assignment's time window: how many booked, and who attended (registered in
 * the live session) as first name + last initial. No email, phone, payment or
 * refund data. Owners and admins see every session happening today, with
 * attendees' emails and whether each one booked.
 */
import { supabaseAdmin } from '@/lib/supabase';
import { assignmentActive, isAdminRole, StaffUser } from '@/lib/staffRules';
import { attendanceFor } from '@/lib/attendance';

export interface LeadAssignment { live_session_id: string | null; ticket_session_id: string | null; valid_from: string | null; valid_to: string | null }

export async function assignmentsFor(s: StaffUser): Promise<LeadAssignment[]> {
  if (!s.email) return [];
  const { data: me } = await supabaseAdmin.from('staff').select('id').ilike('email', s.email).maybeSingle();
  if (!me) return [];
  const { data } = await supabaseAdmin.from('session_leads')
    .select('live_session_id,ticket_session_id,valid_from,valid_to').eq('staff_id', me.id);
  return (data ?? []).filter((a) => assignmentActive(a, Date.now()));
}

/** May this staff member run this booking session (see attendance, add players)? */
export async function canRunTicketSession(s: StaffUser, ticketSessionId: string) {
  if (isAdminRole(s.role)) return true;
  return (await assignmentsFor(s)).some((a) => a.ticket_session_id === ticketSessionId);
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD

/** Everything the /lead screen shows. */
export async function leadConsole(s: StaffUser) {
  const mine = isAdminRole(s.role) ? [] : await assignmentsFor(s);
  const ticketIds = isAdminRole(s.role)
    ? ((await supabaseAdmin.from('sessions').select('id').eq('date', today())).data ?? []).map((x) => x.id)
    : mine.map((a) => a.ticket_session_id).filter(Boolean) as string[];
  const liveIds = isAdminRole(s.role)
    ? ((await supabaseAdmin.from('live_sessions').select('id').in('status', ['setup', 'live'])
        .gte('created_at', new Date(Date.now() - 18 * 3600e3).toISOString())).data ?? []).map((x) => x.id)
    : mine.map((a) => a.live_session_id).filter(Boolean) as string[];

  const [{ data: ticketSessions }, { data: bookings }, { data: live }, attendance] = await Promise.all([
    ticketIds.length ? supabaseAdmin.from('sessions').select('id,title,venue,date,time,capacity').in('id', ticketIds) : Promise.resolve({ data: [] as any[] }),
    ticketIds.length
      ? supabaseAdmin.from('bookings').select('session_id,quantity,spaces_released').in('session_id', ticketIds).in('stripe_status', ['succeeded', 'partially_refunded'])
      : Promise.resolve({ data: [] as any[] }),
    liveIds.length ? supabaseAdmin.from('live_sessions').select('id,name,status,created_at').in('id', liveIds) : Promise.resolve({ data: [] as any[] }),
    // Who attended = who registered in the linked live session. Leads see first
    // name + last initial only; owners/admins also see emails and who booked.
    attendanceFor(ticketIds, isAdminRole(s.role)),
  ]);

  return {
    role: s.role,
    sessions: (ticketSessions ?? []).map((t: any) => {
      const a = attendance?.[t.id];
      return { id: t.id, title: t.title, venue: t.venue, date: t.date, time: t.time, capacity: t.capacity,
        booked: (bookings ?? []).filter((b: any) => b.session_id === t.id)
          .reduce((n: number, b: any) => n + b.quantity - (b.spaces_released ?? 0), 0),
        attendanceReady: attendance !== null,      // false until migration 029 is run
        hasLiveSession: (a?.liveSessionIds.length ?? 0) > 0,
        attendees: a?.attendees ?? [] };
    }),
    live: (live ?? []).sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
      .map((l: any) => ({ id: l.id, name: l.name, status: l.status })),
    canCreateLive: isAdminRole(s.role) || mine.some((a) => a.ticket_session_id),
  };
}
