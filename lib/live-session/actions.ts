/**
 * Server functions wrapping the engine. Service-role only — every caller must
 * already have checked ADMIN_SECRET (see app/api/live/...).
 *
 * The pure transforms live in mapping.ts; this file is the I/O around them.
 */
import { supabaseAdmin } from '@/lib/supabase';
import {
  nextRound as engineNextRound,
  recordScore as engineRecordScore,
  overrideSlot as engineOverrideSlot,
  recomputeRatings,
  roundComplete,
  createSession,
  DEFAULT_CONFIG,
  Level,
  Session,
} from './engine';
import {
  rowsToSession, playerToDerivedRow, playerToRotationRow,
  roundToGameRows, roundToRoundRow,
} from './mapping';

export class LiveSessionError extends Error {}

/** Load all four tables and assemble the engine's Session. */
export async function loadSession(sessionId: string): Promise<Session> {
  const [s, p, g, r] = await Promise.all([
    supabaseAdmin.from('live_sessions').select('*').eq('id', sessionId).single(),
    supabaseAdmin.from('live_session_players').select('*').eq('session_id', sessionId).order('name'),
    supabaseAdmin.from('live_games').select('*').eq('session_id', sessionId).order('round').order('court'),
    supabaseAdmin.from('live_rounds').select('*').eq('session_id', sessionId).order('round'),
  ]);

  if (s.error || !s.data) throw new LiveSessionError(`session not found: ${s.error?.message ?? sessionId}`);
  for (const res of [p, g, r]) {
    if (res.error) throw new LiveSessionError(res.error.message);
  }
  return rowsToSession(s.data, p.data ?? [], g.data ?? [], r.data ?? []);
}

/** Write back the player fields a recompute derives. */
async function persistDerivedPlayers(session: Session) {
  await Promise.all(Object.values(session.players).map((pl) =>
    supabaseAdmin.from('live_session_players')
      .update(playerToDerivedRow(pl))
      .eq('id', pl.id)
      .then(({ error }) => { if (error) throw new LiveSessionError(error.message); })
  ));
}

/**
 * Generate the next round's assignments and persist them.
 *
 * Refuses if the current round still has unscored courts, so the engine never
 * rotates on incomplete data — the admin UI disables the button for the same
 * reason, this is the server-side guard.
 */
export async function generateNextRound(sessionId: string) {
  const session = await loadSession(sessionId);

  const current = session.rounds.length;
  if (current > 0 && !roundComplete(session, current)) {
    throw new LiveSessionError(`round ${current} has unscored courts`);
  }

  const next = engineNextRound(session);
  const round = next.rounds[next.rounds.length - 1];

  const { error: gErr } = await supabaseAdmin
    .from('live_games').insert(roundToGameRows(round, sessionId));
  if (gErr) throw new LiveSessionError(gErr.message);

  const { error: rErr } = await supabaseAdmin
    .from('live_rounds').insert(roundToRoundRow(round, sessionId));
  if (rErr) throw new LiveSessionError(rErr.message);

  // Only sit_outs / sat_last_round change here; ratings are untouched.
  await Promise.all(Object.values(next.players).map((pl) =>
    supabaseAdmin.from('live_session_players')
      .update(playerToRotationRow(pl))
      .eq('id', pl.id)
      .then(({ error }) => { if (error) throw new LiveSessionError(error.message); })
  ));

  if (session.rounds.length === 0) {
    await supabaseAdmin.from('live_sessions').update({ status: 'live' }).eq('id', sessionId);
  }
  return { round, session: next };
}

/**
 * Record one court's score, then recompute every rating from scratch.
 *
 * Ratings are a pure function of (roster, results in order), so a corrected
 * score just replaces the row and the whole table is rebuilt — no incremental
 * adjustment to get wrong.
 */
export async function recordScore(
  sessionId: string, round: number, court: number, scoreA: number, scoreB: number,
) {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    throw new LiveSessionError('scores must be non-negative integers');
  }

  const session = await loadSession(sessionId);
  const updated = engineRecordScore(session, round, court, scoreA, scoreB);

  const { error } = await supabaseAdmin
    .from('live_games')
    .update({ score_a: scoreA, score_b: scoreB })
    .eq('session_id', sessionId).eq('round', round).eq('court', court);
  if (error) throw new LiveSessionError(error.message);

  await persistDerivedPlayers(updated);
  return updated;
}

/** Manually move a player into a slot, then re-derive ratings from the new pairings. */
export async function overrideSlot(
  sessionId: string, round: number, court: number,
  slot: 'A.a' | 'A.b' | 'B.a' | 'B.b', playerId: string,
) {
  const session = await loadSession(sessionId);
  if (!session.players[playerId]) throw new LiveSessionError(`player ${playerId} not in session`);

  const moved = engineOverrideSlot(session, round, court, slot, playerId);
  const match = moved.rounds[round - 1]?.matches.find((m) => m.court === court);
  if (!match) throw new LiveSessionError(`court ${court} not in round ${round}`);

  const { error } = await supabaseAdmin
    .from('live_games')
    .update({ team_a: match.teamA, team_b: match.teamB })
    .eq('session_id', sessionId).eq('round', round).eq('court', court);
  if (error) throw new LiveSessionError(error.message);

  // The override may have changed who played a scored game, so ratings shift.
  const rerated = recomputeRatings(moved);
  await persistDerivedPlayers(rerated);
  return rerated;
}

/** Undo the most recent round: drop its games, its sit-out row, and re-derive. */
export async function undoLastRound(sessionId: string) {
  const session = await loadSession(sessionId);
  const last = session.rounds.length;
  if (last === 0) throw new LiveSessionError('no rounds to undo');

  await supabaseAdmin.from('live_games').delete()
    .eq('session_id', sessionId).eq('round', last);
  await supabaseAdmin.from('live_rounds').delete()
    .eq('session_id', sessionId).eq('round', last);

  const reloaded = await loadSession(sessionId);
  const rerated = recomputeRatings(reloaded);

  // Roll back the sit-out counters the removed round applied.
  await Promise.all(Object.values(rerated.players).map((pl) => {
    const sat = session.rounds[last - 1].sitOuts.includes(pl.id);
    return supabaseAdmin.from('live_session_players')
      .update({
        ...playerToDerivedRow(pl),
        sit_outs: Math.max(0, pl.sitOuts - (sat ? 1 : 0)),
        sat_last_round: last >= 2 ? session.rounds[last - 2].sitOuts.includes(pl.id) : false,
      })
      .eq('id', pl.id)
      .then(({ error }) => { if (error) throw new LiveSessionError(error.message); });
  }));

  return rerated;
}

/** Create a session and seed its roster. */
export async function createLiveSession(
  name: string, roster: { name: string; level: Level }[], seed = 1,
  config = DEFAULT_CONFIG, courts?: number,
) {
  if (courts && courts !== config.rotation.courts) {
    config = { ...config, rotation: { ...config.rotation, courts } };
  }
  const { data: s, error } = await supabaseAdmin
    .from('live_sessions')
    .insert({ name, config, seed, status: 'setup' })
    .select().single();
  if (error || !s) throw new LiveSessionError(error?.message ?? 'could not create session');

  // Let the engine assign starting ratings from each player's level, then let
  // Postgres mint the ids — the engine's ids are placeholders until insert.
  const seeded = createSession(
    roster.map((r, i) => ({ id: String(i), name: r.name, level: r.level })), config, seed,
  );
  const rows = Object.values(seeded.players).map((p) => ({
    session_id: s.id,
    name: p.name,
    level: p.level,
    rating: p.rating,
    games: p.games,
    sit_outs: p.sitOuts,
    sat_last_round: p.satLastRound,
    beginner: p.beginner,
    above_median_streak: p.aboveMedianStreak,
    history: p.history,
  }));

  const { error: pErr } = await supabaseAdmin.from('live_session_players').insert(rows);
  if (pErr) throw new LiveSessionError(pErr.message);
  return s.id as string;
}
