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
  standings,
  grandFinal,
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

/**
 * Players who left mid-session. Kept in the database (their games still count
 * toward everyone else's ratings) but excluded from every future draw.
 * Stored in the config jsonb, so no schema change.
 */
export const withdrawnIds = (session: Session): Set<string> =>
  new Set(((session.config as any)?.withdrawn as string[] | undefined) ?? []);

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
  const finalAt = (session.config as any).finalRound as number | undefined;
  if (finalAt && finalAt <= session.rounds.length) {
    throw new LiveSessionError('the grand final has been drawn — undo it first to play another round');
  }

  const current = session.rounds.length;
  if (current > 0 && !roundComplete(session, current)) {
    throw new LiveSessionError(`round ${current} has unscored courts`);
  }

  // Draw from players still here; players who left keep their rows (their
  // games feed other players' ratings) but are never drawn again.
  const gone = withdrawnIds(session);
  const here = Object.fromEntries(Object.entries(session.players).filter(([id]) => !gone.has(id)));
  const drawn = engineNextRound({ ...session, players: here });
  const next = { ...drawn, players: { ...session.players, ...drawn.players } };
  const round = next.rounds[next.rounds.length - 1];

  const { error: gErr } = await supabaseAdmin
    .from('live_games').insert(roundToGameRows(round, sessionId));
  if (gErr) throw new LiveSessionError(gErr.message);

  const { error: rErr } = await supabaseAdmin
    .from('live_rounds').insert(roundToRoundRow(round, sessionId));
  if (rErr) throw new LiveSessionError(rErr.message);

  // Only sit_outs / sat_last_round change here; ratings are untouched.
  await Promise.all(Object.values(drawn.players).map((pl) =>
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
  const prev = session.results.find((g) => g.round === round && g.court === court);
  const updated = engineRecordScore(session, round, court, scoreA, scoreB);

  const { error } = await supabaseAdmin
    .from('live_games')
    .update({ score_a: scoreA, score_b: scoreB })
    .eq('session_id', sessionId).eq('round', round).eq('court', court);
  if (error) throw new LiveSessionError(error.message);

  await persistDerivedPlayers(updated);

  if (!prev || prev.scoreA !== scoreA || prev.scoreB !== scoreB) {
    const m = session.rounds[round - 1]?.matches.find((x) => x.court === court);
    await logScoreEvent({
      session_id: sessionId, round, court, event: 'score',
      old_a: prev?.scoreA ?? null, old_b: prev?.scoreB ?? null, new_a: scoreA, new_b: scoreB,
      detail: m ? {
        teamA: [session.players[m.teamA.a]?.name, session.players[m.teamA.b]?.name],
        teamB: [session.players[m.teamB.a]?.name, session.players[m.teamB.b]?.name],
      } : {},
    });
  }
  return updated;
}

/** Manually move a player into a slot, then re-derive ratings from the new pairings. */
export async function overrideSlot(
  sessionId: string, round: number, court: number,
  slot: 'A.a' | 'A.b' | 'B.a' | 'B.b', playerId: string,
) {
  const session = await loadSession(sessionId);
  if (!session.players[playerId]) throw new LiveSessionError(`player ${playerId} not in session`);

  const before = session.rounds[round - 1]?.matches.find((m) => m.court === court);
  const [t, pos] = slot.split('.') as ['A' | 'B', 'a' | 'b'];
  const replacedId = before ? (t === 'A' ? before.teamA : before.teamB)[pos] : undefined;
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
  const scored = session.results.find((g) => g.round === round && g.court === court);
  await logScoreEvent({
    session_id: sessionId, round, court, event: 'override',
    old_a: scored?.scoreA ?? null, old_b: scored?.scoreB ?? null,
    new_a: scored?.scoreA ?? null, new_b: scored?.scoreB ?? null,
    detail: { slot, from: replacedId ? session.players[replacedId]?.name : null, to: session.players[playerId]?.name },
  });
  return rerated;
}

/** Undo the most recent round: drop its games, its sit-out row, and re-derive. */
export async function undoLastRound(sessionId: string) {
  const session = await loadSession(sessionId);
  const last = session.rounds.length;
  if (last === 0) throw new LiveSessionError('no rounds to undo');

  for (const g of session.results.filter((x) => x.round === last)) {
    await logScoreEvent({
      session_id: sessionId, round: last, court: g.court, event: 'undo',
      old_a: g.scoreA, old_b: g.scoreB, new_a: null, new_b: null,
    });
  }
  await supabaseAdmin.from('live_games').delete()
    .eq('session_id', sessionId).eq('round', last);
  await supabaseAdmin.from('live_rounds').delete()
    .eq('session_id', sessionId).eq('round', last);

  if ((session.config as any).finalRound === last) {
    const { finalRound: _f, ...rest } = session.config as any;
    await supabaseAdmin.from('live_sessions').update({ config: rest }).eq('id', sessionId);
  }

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
  if (roster.length === 0) return s.id as string;
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

/** Add a player to a running session. They start at their level's rating. */
export async function addPlayer(sessionId: string, name: string, level: Level) {
  const session = await loadSession(sessionId);
  const clean = name.trim();
  if (!clean) throw new LiveSessionError('name required');
  if (Object.values(session.players).some((p) => p.name.toLowerCase() === clean.toLowerCase()))
    throw new LiveSessionError(`${clean} is already in this session`);

  const start = session.config.rating.start[level];
  const { error } = await supabaseAdmin.from('live_session_players').insert({
    session_id: sessionId,
    name: clean,
    level,
    rating: start,
    games: 0,
    // Joining late should not push them straight to the front of the sit-out
    // queue, nor make them instantly "due" a rest. Match the lowest sit-out
    // count already in the session.
    sit_outs: Math.min(...Object.values(session.players).map((p) => p.sitOuts), 0),
    sat_last_round: false,
    beginner: level === 'beginner',
    above_median_streak: 0,
    history: [],
  });
  if (error) throw new LiveSessionError(error.message);
  await nudge(sessionId);
}

/**
 * Change a player's name or level.
 *
 * Changing level changes their starting rating, and ratings are recomputed
 * from all games, so a correction applies retroactively — which is what you
 * want when someone was entered at the wrong level.
 */
export async function updatePlayer(
  sessionId: string, playerId: string, patch: { name?: string; level?: Level },
) {
  const session = await loadSession(sessionId);
  if (!session.players[playerId]) throw new LiveSessionError('player not in this session');

  const update: Record<string, any> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (!clean) throw new LiveSessionError('name cannot be empty');
    if (Object.values(session.players).some(
      (p) => p.id !== playerId && p.name.toLowerCase() === clean.toLowerCase()))
      throw new LiveSessionError(`${clean} is already in this session`);
    update.name = clean;
  }
  if (patch.level !== undefined) {
    update.level = patch.level;
    update.beginner = patch.level === 'beginner';
  }
  if (Object.keys(update).length === 0) throw new LiveSessionError('nothing to update');

  const { error } = await supabaseAdmin
    .from('live_session_players').update(update).eq('id', playerId);
  if (error) throw new LiveSessionError(error.message);

  // Level drives the starting rating, so re-derive everything.
  if (patch.level !== undefined) {
    const reloaded = await loadSession(sessionId);
    await persistDerivedPlayers(recomputeRatings(reloaded));
  }
  await nudge(sessionId);
}

/**
 * Remove a player (dropped out).
 *
 * Refused while they are in the current round's assignments — deleting them
 * would leave a court with a blank slot. Undo the round first, or use
 * overrideSlot to swap someone in.
 */
export async function removePlayer(sessionId: string, playerId: string) {
  const session = await loadSession(sessionId);
  if (!session.players[playerId]) throw new LiveSessionError('player not in this session');

  const current = session.rounds[session.rounds.length - 1];
  if (current) {
    const onCourt = current.matches.some((m) =>
      [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].includes(playerId));
    if (onCourt) {
      throw new LiveSessionError(
        `${session.players[playerId].name} is on court this round — ` +
        'swap them out with Override slots, or undo the round first');
    }
  }

  // Anyone who has been drawn into a game must keep their row: the games
  // reference them, and every rating is recomputed from those games. Deleting
  // such a player left orphaned games and crashed the standings. So they are
  // marked as left instead; only someone never drawn is actually deleted.
  const appeared = session.rounds.some((r) =>
    r.sitOuts.includes(playerId) ||
    r.matches.some((m) => [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].includes(playerId)));
  if (appeared) {
    const gone = withdrawnIds(session); gone.add(playerId);
    const { error } = await supabaseAdmin.from('live_sessions')
      .update({ config: { ...(session.config as any), withdrawn: [...gone] } }).eq('id', sessionId);
    if (error) throw new LiveSessionError(error.message);
  } else {
    const { error } = await supabaseAdmin
      .from('live_session_players').delete().eq('id', playerId);
    if (error) throw new LiveSessionError(error.message);
  }
  await nudge(sessionId);
}

/**
 * Generate the grand final as its own round: one match on court 1, everyone
 * else sitting. Separate from generateNextRound so "Generate next round" can
 * never accidentally produce the final, or vice versa.
 */
export async function generateGrandFinal(sessionId: string) {
  const session = await loadSession(sessionId);
  const already = (session.config as any).finalRound as number | undefined;
  if (already && already <= session.rounds.length) throw new LiveSessionError('the grand final is already drawn');

  const current = session.rounds.length;
  if (current > 0 && !roundComplete(session, current)) {
    throw new LiveSessionError(`round ${current} has unscored courts`);
  }

  // Hard rule applies to the final too: if the top four would put a flagged
  // beginner with a strong, the beginner steps aside for the next eligible.
  const gone = withdrawnIds(session);
  let table = standings(session.players, session.results, session.config.finals)
    .filter((t) => !gone.has(t.id));
  const top = table.filter((t) => t.eligible).slice(0, session.config.finals.finalists);
  const hasStrong = top.some((t) => session.players[t.id]?.level === 'strong');
  if (hasStrong) table = table.filter((t) => !session.players[t.id]?.beginner);
  const match = grandFinal(table, session.config.finals);
  if (!match) {
    throw new LiveSessionError(
      `not enough players with ${session.config.finals.minGames}+ games for a final`);
  }

  const index = current + 1;
  const finalists = new Set([match.teamA.a, match.teamA.b, match.teamB.a, match.teamB.b]);
  const sitOuts = Object.keys(session.players).filter((id) => !finalists.has(id));

  const { error: gErr } = await supabaseAdmin.from('live_games').insert({
    session_id: sessionId, round: index, court: 1,
    team_a: match.teamA, team_b: match.teamB, score_a: null, score_b: null,
  });
  if (gErr) throw new LiveSessionError(gErr.message);

  const { error: rErr } = await supabaseAdmin
    .from('live_rounds').insert({ session_id: sessionId, round: index, sit_outs: sitOuts });
  if (rErr) throw new LiveSessionError(rErr.message);

  // Mark the final in config (no schema change) so the UI and
  // generateNextRound both know no ordinary round follows it.
  await supabaseAdmin.from('live_sessions')
    .update({ config: { ...(session.config as any), finalRound: index } }).eq('id', sessionId);

  return { round: index, match };
}

/** Mark the session finished, so /live/latest stops pointing at it. */
export async function finishSession(sessionId: string) {
  const { error } = await supabaseAdmin
    .from('live_sessions').update({ status: 'finished' }).eq('id', sessionId);
  if (error) throw new LiveSessionError(error.message);
}

/* ── Session metadata, registration, nudges, score log ─────────────────── */

export interface SessionMeta {
  name: string;
  status: 'setup' | 'live' | 'finished';
  registrationOpen: boolean;
}

/** Name, status and registration state — kept out of the engine's Session. */
export async function loadMeta(sessionId: string): Promise<SessionMeta> {
  const { data, error } = await supabaseAdmin
    .from('live_sessions').select('name,status,config').eq('id', sessionId).single();
  if (error || !data) throw new LiveSessionError(`session not found: ${error?.message ?? sessionId}`);
  return {
    name: data.name,
    status: data.status,
    // Stored in the config jsonb so no schema change is needed. Absent = open,
    // which is how every session created before this change behaves.
    registrationOpen: (data.config as any)?.registrationOpen !== false,
  };
}

export async function setRegistrationOpen(sessionId: string, open: boolean) {
  const { data, error } = await supabaseAdmin
    .from('live_sessions').select('config').eq('id', sessionId).single();
  if (error || !data) throw new LiveSessionError(error?.message ?? 'session not found');
  const { error: uErr } = await supabaseAdmin
    .from('live_sessions').update({ config: { ...(data.config as any), registrationOpen: open } }).eq('id', sessionId);
  if (uErr) throw new LiveSessionError(uErr.message);
}

/**
 * Touch the session row so realtime subscribers refetch.
 *
 * Browsers cannot subscribe to live_session_players (anon has no read access
 * since migration 006), so a new registration would otherwise be invisible to
 * the admin page until something else changed. An UPDATE on live_sessions —
 * which anon can read — fires the event without exposing player data.
 */
export async function nudge(sessionId: string) {
  // Conditional no-op writes: "set status = X where status = X". Atomic, so it
  // can never overwrite a status change made in between — a read-then-write
  // here could revert a session to 'setup' if someone registered at the moment
  // the organiser pressed Start.
  for (const st of ['setup', 'live', 'finished'] as const) {
    await supabaseAdmin.from('live_sessions').update({ status: st }).eq('id', sessionId).eq('status', st);
  }
}

export type LogEvent = 'score' | 'undo' | 'override';

/**
 * Append to the score-edit log. Never throws: a logging failure must not stop
 * a score being saved mid-session. If the table is missing (migration 008 not
 * yet run) the entry is dropped and the reason is returned.
 */
export async function logScoreEvent(entry: {
  session_id: string; round: number; court: number; event: LogEvent;
  old_a?: number | null; old_b?: number | null; new_a?: number | null; new_b?: number | null;
  detail?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const { error } = await supabaseAdmin.from('live_score_log').insert(entry);
    if (error) { console.error('[score-log]', error.message); return error.message; }
    return null;
  } catch (e) {
    console.error('[score-log]', (e as Error).message);
    return (e as Error).message;
  }
}

export async function readScoreLog(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from('live_score_log').select('*').eq('session_id', sessionId).order('created_at', { ascending: false });
  if (error) return { log: [], unavailable: error.message };
  return { log: data ?? [], unavailable: null as string | null };
}


/** Undo a withdrawal: the player rejoins the rotation from the next round. */
export async function rejoinPlayer(sessionId: string, playerId: string) {
  const session = await loadSession(sessionId);
  const gone = withdrawnIds(session);
  if (!gone.has(playerId)) throw new LiveSessionError('that player has not left');
  gone.delete(playerId);
  const { error } = await supabaseAdmin.from('live_sessions')
    .update({ config: { ...(session.config as any), withdrawn: [...gone] } }).eq('id', sessionId);
  if (error) throw new LiveSessionError(error.message);
  await nudge(sessionId);
}
