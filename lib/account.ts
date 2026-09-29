/**
 * Player accounts (Roadmap Phase 4a). Server only.
 *
 * The browser signs in with Supabase Auth (emailed sign-in code) and sends its
 * access token as `Authorization: Bearer …`. The server checks the token with
 * Supabase, then finds or creates the matching `players` row by email.
 */
import { supabaseAdmin } from '@/lib/supabase';

export interface AccountUser { id: string; email: string }

export interface PlayerRow {
  id: string; auth_user_id: string | null; email: string;
  display_name: string | null; first_name: string | null; last_initial: string | null;
  level_self: string | null; level_admin: string | null; leaderboard_opt_in: boolean;
}

/** The signed-in user behind a request, or null. Never trusts anything but a token Supabase accepts. */
export async function userFromRequest(req: Request): Promise<AccountUser | null> {
  const h = req.headers.get('authorization') ?? '';
  const token = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}

/** Find or create the player for a signed-in user. Matching by email links bookings made before the account existed. */
export async function ensurePlayer(u: AccountUser): Promise<PlayerRow> {
  const { data: mine } = await supabaseAdmin.from('players').select('*').eq('auth_user_id', u.id).maybeSingle();
  if (mine) {
    await supabaseAdmin.from('players').update({ last_seen_at: new Date().toISOString() }).eq('id', mine.id);
    return mine as PlayerRow;
  }
  const { data: byEmail } = await supabaseAdmin.from('players').select('*').ilike('email', u.email).maybeSingle();
  if (byEmail) {
    const { data } = await supabaseAdmin.from('players').update({ auth_user_id: u.id, last_seen_at: new Date().toISOString() })
      .eq('id', byEmail.id).select().single();
    return (data ?? byEmail) as PlayerRow;
  }
  const { data, error } = await supabaseAdmin.from('players').insert({ auth_user_id: u.id, email: u.email }).select().single();
  if (error || !data) throw new Error(error?.message ?? 'could not create account');
  return data as PlayerRow;
}

/** "First L." — how other players see someone. */
export const shortName = (first: string, last: string) =>
  `${first.trim()}${last.trim() ? ` ${last.trim()[0].toUpperCase()}.` : ''}`;

/** Upcoming and past paid bookings for this email, and the live sessions this player played. */
export async function mySessions(p: PlayerRow) {
  const [{ data: bookings }, { data: live }] = await Promise.all([
    supabaseAdmin.from('bookings')
      .select('booking_ref,quantity,created_at,session_id,sessions(title,venue,date,time,maps_url,status)')
      .ilike('email', p.email).eq('stripe_status', 'succeeded').order('created_at', { ascending: false }),
    supabaseAdmin.from('live_session_players')
      .select('id,session_id,live_sessions(name,status,created_at)').eq('player_id', p.id),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = (bookings ?? []).map((b: any) => ({
    ref: b.booking_ref, quantity: b.quantity, title: b.sessions?.title, venue: b.sessions?.venue,
    date: b.sessions?.date as string | undefined, time: b.sessions?.time, mapsUrl: b.sessions?.maps_url ?? null,
    cancelled: b.sessions?.status === 'cancelled',
  }));
  return {
    upcoming: rows.filter((b) => (b.date ?? '') >= today).sort((a, b) => (a.date! < b.date! ? -1 : 1)),
    past: rows.filter((b) => (b.date ?? '') < today),
    live: (live ?? []).map((l: any) => ({
      sessionId: l.session_id, playerId: l.id, name: l.live_sessions?.name, status: l.live_sessions?.status,
      date: l.live_sessions?.created_at,
    })).sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}
