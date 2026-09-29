/**
 * "Download my data": everything held about the signed-in player, as JSON.
 * Server only. Tables from other features are read defensively — if one is
 * missing, the export says so instead of failing.
 */
import { supabaseAdmin } from '@/lib/supabase';
import type { PlayerRow } from '@/lib/account';

async function rows(table: string, build: (q: any) => any) {
  try {
    const { data, error } = await build(supabaseAdmin.from(table).select('*'));
    return error ? { unavailable: error.message } : data ?? [];
  } catch (e) { return { unavailable: (e as Error).message }; }
}

export async function exportMyData(p: PlayerRow) {
  const email = p.email;
  const { data: live } = await supabaseAdmin.from('live_session_players')
    .select('id,session_id,name,level,registered_level,start_level,level_history,rating,games,history,live_sessions(name,created_at)')
    .eq('player_id', p.id);
  const liveIds = (live ?? []).map((l) => l.id);
  const sessionIds = (live ?? []).map((l) => l.session_id);
  const { data: games } = sessionIds.length
    ? await supabaseAdmin.from('live_games').select('session_id,round,court,team_a,team_b,score_a,score_b').in('session_id', sessionIds)
    : { data: [] };
  const mine = (games ?? []).filter((g: any) => liveIds.some((id) =>
    [g.team_a?.a, g.team_a?.b, g.team_b?.a, g.team_b?.b].includes(id)));

  return {
    exportedAt: new Date().toISOString(),
    controller: 'The Shuttle Social — theshuttlesocial@gmail.com',
    account: {
      email: p.email, name: p.display_name, level: p.level_self, levelSetByOrganiser: p.level_admin,
      leaderboardOptIn: p.leaderboard_opt_in,
    },
    bookings: await rows('bookings', (q) => q.ilike('email', email)),
    waitlist: await rows('waitlist', (q) => q.ilike('email', email)),
    credits: await rows('credits', (q) => q.ilike('email', email)),
    liveSessions: (live ?? []).map((l: any) => ({
      session: l.live_sessions?.name, date: l.live_sessions?.created_at, nameShown: l.name,
      level: l.level, levelPicked: l.registered_level, startingLevel: l.start_level, levelChanges: l.level_history,
      ratingAtEnd: Number(l.rating), games: l.games, ratingAfterEachGame: l.history,
    })),
    liveGames: mine.map((g: any) => ({ round: g.round, court: g.court, score: [g.score_a, g.score_b] })),
    liveChangeLog: liveIds.length ? await rows('live_score_log', (q) => q.in('player_id', liveIds)) : [],
    notes: [
      'Card details are handled by Stripe and are never stored by The Shuttle Social.',
      'Other players in your games are identified internally; their names are not included here.',
    ],
  };
}
