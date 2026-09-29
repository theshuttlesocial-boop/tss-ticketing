/**
 * Build the TSS Rating (v2) history from the live-session tables, in date
 * order across every session. Server only, read-only — shadow mode: nothing
 * here changes what players or the draw see until the switch is approved.
 *
 * A player is the same person across sessions when linked to an account;
 * otherwise by name (case and spacing ignored).
 */
import { supabaseAdmin } from '@/lib/supabase';
import { RATING_V2, RatingV2Config, Level } from './config';
import { NewPlayer, predictionAccuracy, RatedGame, replayV2 } from './engine';

const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

export interface V2History {
  roster: NewPlayer[];
  games: (RatedGame & { sessionId: string; round: number })[];
  sessions: { id: string; name: string; at: string }[];
  keyOf: Record<string, string>;     // live_session_players.id → person key
  names: Record<string, string>;     // person key → latest name
}

export async function loadV2History(upToSessionId?: string): Promise<V2History> {
  const { data: sessions } = await supabaseAdmin.from('live_sessions').select('id,name,created_at,config').order('created_at');
  let list = sessions ?? [];
  if (upToSessionId) {
    const i = list.findIndex((s) => s.id === upToSessionId);
    if (i >= 0) list = list.slice(0, i + 1);
  }
  const ids = list.map((s) => s.id);
  if (!ids.length) return { roster: [], games: [], sessions: [], keyOf: {}, names: {} };
  const [{ data: players }, { data: games }] = await Promise.all([
    supabaseAdmin.from('live_session_players').select('id,session_id,name,level,start_level,player_id').in('session_id', ids),
    supabaseAdmin.from('live_games').select('session_id,round,court,team_a,team_b,score_a,score_b,unrated').in('session_id', ids).not('score_a', 'is', null),
  ]);
  const keyOf: Record<string, string> = {}, names: Record<string, string> = {}, first: Record<string, NewPlayer> = {};
  const order = new Map(list.map((s, i) => [s.id, i]));
  for (const p of [...(players ?? [])].sort((a, b) => order.get(a.session_id)! - order.get(b.session_id)!)) {
    const key = p.player_id ? `acct:${p.player_id}` : `name:${nameKey(p.name)}`;
    keyOf[p.id] = key; names[key] = p.name;
    if (!first[key]) first[key] = { key, level: (p.start_level ?? p.level) as Level };
  }
  const at = (s: any, round: number, court: number) =>
    new Date(Date.parse(s.created_at) + (round * 10 + court) * 60_000).toISOString();
  const out: V2History['games'] = [];
  for (const g of games ?? []) {
    const s = list.find((x) => x.id === g.session_id)!;
    const k = (id: string) => keyOf[id] ?? `gone:${id}`;
    out.push({ sessionId: g.session_id, round: g.round, at: at(s, g.round, g.court),
      teamA: [k(g.team_a.a), k(g.team_a.b)], teamB: [k(g.team_b.a), k(g.team_b.b)], scoreA: g.score_a, scoreB: g.score_b,
      kind: (s.config as any)?.finalRound === g.round ? 'final' : 'normal', unrated: (g.unrated ?? []).map(k) });
  }
  return { roster: Object.values(first), games: out, sessions: list.map((s) => ({ id: s.id, name: s.name, at: s.created_at })), keyOf, names };
}

/** Shadow numbers for one session: v2 prediction accuracy in both modes, and each player's v2 rating after it. */
export function shadowFor(h: V2History, sessionId: string) {
  const modes = { win_loss: RATING_V2, point_share: { ...RATING_V2, outcome: 'point_share' as const } } satisfies Record<string, RatingV2Config>;
  const res: Record<string, { accuracy: number | null; games: number; ratings: Record<string, number> }> = {};
  for (const [name, cfg] of Object.entries(modes)) {
    const r = replayV2(h.roster, h.games, cfg);
    const inSession = new Set(h.games.filter((g) => g.sessionId === sessionId).map((g) => g.at));
    const acc = predictionAccuracy(r.games, (g) => inSession.has(g.at) && (g as any).round >= 3);
    const ratings: Record<string, number> = {};
    for (const [pid, key] of Object.entries(h.keyOf)) if (r.players[key]) ratings[pid] = Math.round(r.players[key].rating);
    res[name] = { accuracy: acc.accuracy, games: acc.games, ratings };
  }
  return res;
}
