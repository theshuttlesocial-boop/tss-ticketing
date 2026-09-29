/**
 * Loads a signed-in player's live-session history. Server only.
 */
import { supabaseAdmin } from '@/lib/supabase';
import type { PlayerRow } from '@/lib/account';
import { buildHistory, publicName, SessionInput } from './history';

export async function loadHistory(me: PlayerRow) {
  const { data: mine } = await supabaseAdmin.from('live_session_players')
    .select('id,session_id,name,rating,history,start_level,level').eq('player_id', me.id);
  if (!mine?.length) return buildHistory([]);
  const ids = mine.map((m) => m.session_id);
  const [{ data: sessions }, { data: games }, { data: people }] = await Promise.all([
    supabaseAdmin.from('live_sessions').select('id,name,created_at,config').in('id', ids),
    supabaseAdmin.from('live_games').select('*').in('session_id', ids).not('score_a', 'is', null),
    supabaseAdmin.from('live_session_players').select('id,session_id,name,player_id,rating').in('session_id', ids),
  ]);
  // Other players' ratings are shown only when both sides opted in.
  const linked = [...new Set((people ?? []).map((p) => p.player_id).filter(Boolean))] as string[];
  const { data: optIn } = me.leaderboard_opt_in && linked.length
    ? await supabaseAdmin.from('players').select('id').in('id', linked).eq('leaderboard_opt_in', true)
    : { data: [] as { id: string }[] };
  const shared = new Set((optIn ?? []).map((p) => p.id));

  const inputs: SessionInput[] = mine.map((m) => {
    const s = (sessions ?? []).find((x) => x.id === m.session_id)!;
    const start = (s?.config as any)?.rating?.start?.[m.start_level ?? m.level] ?? Number(m.rating);
    const ppl: SessionInput['people'] = {};
    for (const p of (people ?? []).filter((x) => x.session_id === m.session_id)) {
      ppl[p.id] = { name: p.id === m.id ? p.name : publicName(p.name), accountId: p.player_id ?? null,
        ...(p.player_id && shared.has(p.player_id) && p.id !== m.id ? { rating: Math.round(Number(p.rating)) } : {}) };
    }
    return {
      sessionId: m.session_id, name: s?.name ?? 'Session', date: s?.created_at ?? '', me: m.id,
      myRating: Math.round(Number(m.rating)), myStart: Math.round(Number(start)),
      games: (games ?? []).filter((g) => g.session_id === m.session_id).map((g) => ({
        round: g.round, court: g.court, teamA: g.team_a, teamB: g.team_b, scoreA: g.score_a, scoreB: g.score_b,
        unrated: g.unrated ?? [] })),
      people: ppl,
    };
  });
  return buildHistory(inputs);
}

/** Public leaderboard: opted-in players only, first name + initial, rating at their latest session. */
export async function leaderboard() {
  const { data: ps } = await supabaseAdmin.from('players').select('id,display_name').eq('leaderboard_opt_in', true);
  if (!ps?.length) return [];
  const { data: rows } = await supabaseAdmin.from('live_session_players')
    .select('player_id,rating,session_id,live_sessions(created_at)').in('player_id', ps.map((p) => p.id));
  const out = ps.map((p) => {
    const mine = (rows ?? []).filter((r: any) => r.player_id === p.id)
      .sort((a: any, b: any) => (a.live_sessions?.created_at < b.live_sessions?.created_at ? 1 : -1));
    return { name: publicName(p.display_name ?? 'Player'), rating: mine[0] ? Math.round(Number(mine[0].rating)) : null, sessions: mine.length };
  }).filter((x) => x.rating !== null);
  return out.sort((a, b) => b.rating! - a.rating!);
}
