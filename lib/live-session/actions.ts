/**
 * Server functions wrapping the engine. Service-role only — every caller must
 * already have passed the staff check (lib/staff.ts, via app/api/live/...).
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
  changeLevel,
  correctStartLevel as engineCorrectStartLevel,
  ratingImpact,
  reviewLevels,
  courtViolates,
  CONFIG_VERSION,
  Level,
  Player,
  Session,
} from './engine';
import {
  rowsToSession, playerToDerivedRow, playerToRotationRow,
  roundToGameRows, roundToRoundRow,
} from './mapping';
import { buildConfig } from './config';
import { currentActor } from '@/lib/actor';
import type { LogEvent } from './changeLog';

export class LiveSessionError extends Error {}

/** A change the admin must confirm (e.g. a swap that breaks the strong/beginner rule). */
export class NeedsConfirmError extends LiveSessionError {}

const cfgOf = (s: Session) => s.config as any;

/** Columns added by migration 011. */
const M011 = ['registered_level', 'start_level', 'level_history', 'level_locked', 'config_version', 'unrated'];

/**
 * Write a row, and if the database says a migration-011 column doesn't exist
 * yet, write it again without those columns. Keeps session creation and
 * self-registration working if the code is deployed before the migration
 * is run — the one failure that would stop a live session at the door.
 */
export async function writeCompat<T>(
  write: (row: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  row: Record<string, unknown>,
) {
  const res = await write(row);
  if (res.error && M011.some((c) => res.error!.message.includes(c))) {
    console.warn('[live] migration 011 not run yet — writing without its columns');
    return write(Object.fromEntries(Object.entries(row).filter(([k]) => !M011.includes(k))));
  }
  return res;
}
const onCourt = (m: { teamA: { a: string; b: string }; teamB: { a: string; b: string } }) =>
  [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b];

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

/** Write a player's level fields after a level change. */
async function persistLevel(pl: Player) {
  const { error } = await writeCompat((row) => supabaseAdmin.from('live_session_players').update(row).eq('id', pl.id), {
    level: pl.level,
    beginner: pl.level === 'beginner',
    start_level: pl.startLevel ?? pl.level,
    level_history: pl.levelChanges ?? [],
  });
  if (error) throw new LiveSessionError(error.message);
}

/**
 * Generate the next round's assignments and persist them.
 *
 * Refuses if the current round still has unscored courts, so the engine never
 * rotates on incomplete data — the admin UI disables the button for the same
 * reason, this is the server-side guard.
 */
export async function generateNextRound(sessionId: string) {
  const loaded = await loadSession(sessionId);
  const finalAt = cfgOf(loaded).finalRound as number | undefined;
  if (finalAt && finalAt <= loaded.rounds.length) {
    throw new LiveSessionError('the grand final has been drawn — undo it first to play another round');
  }

  const current = loaded.rounds.length;
  if (current > 0 && !roundComplete(loaded, current)) {
    throw new LiveSessionError(`round ${current} has unscored courts`);
  }

  // Level review: after every scored round, anyone clearly playing at another
  // level moves one step from THIS draw on (engine/review.ts). Suggest-only
  // proposals wait for an admin tap in the Needs-attention panel.
  const gone = withdrawnIds(loaded);
  let session = loaded;
  if (current > 0) {
    const blocked = new Set<string>(cfgOf(session).blockedMoves ?? []);
    const moves = reviewLevels(session, { exclude: gone, blocked }).filter((p) => p.auto);
    for (const mv of moves) {
      session = changeLevel(session, mv.playerId, mv.to, current + 1, 'system',
        `After ${mv.games} games (rating ${Math.round(mv.rating)})`);
    }
    if (moves.length) {
      for (const mv of moves) await persistLevel(session.players[mv.playerId]);
      await persistDerivedPlayers(session);
      for (const mv of moves) {
        await logEvent({ session_id: sessionId, event: 'level', round: current + 1, actor: 'system', player_id: mv.playerId,
          detail: { name: mv.name, from: mv.from, to: mv.to, rating: Math.round(mv.rating), games: mv.games } });
      }
    }
  }

  // Draw from players still here; players who left keep their rows (their
  // games feed other players' ratings) but are never drawn again.
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

  if (current === 0) {
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
    await logEvent({
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
  opts: { force?: boolean } = {},
) {
  const session = await loadSession(sessionId);
  if (!session.players[playerId]) throw new LiveSessionError(`player ${playerId} not in session`);

  const before = session.rounds[round - 1]?.matches.find((m) => m.court === court);
  const [t, pos] = slot.split('.') as ['A' | 'B', 'a' | 'b'];
  const replacedId = before ? (t === 'A' ? before.teamA : before.teamB)[pos] : undefined;
  const moved = engineOverrideSlot(session, round, court, slot, playerId);
  const match = moved.rounds[round - 1]?.matches.find((m) => m.court === court);
  if (!match) throw new LiveSessionError(`court ${court} not in round ${round}`);

  // The hard rule applies to hand changes too (Session 88's round-6 swap put a
  // strong beside a beginner). Only for the round being played: a past game is
  // a record of who actually played, not a draw.
  const latest = round === session.rounds.length;
  if (latest && !opts.force && courtViolates(onCourt(match).map((id) => session.players[id]).filter(Boolean))) {
    throw new NeedsConfirmError(
      `This puts a Strong player and a beginner on court ${court}. Swap anyway?`);
  }

  const { error } = await supabaseAdmin
    .from('live_games')
    .update({ team_a: match.teamA, team_b: match.teamB })
    .eq('session_id', sessionId).eq('round', round).eq('court', court);
  if (error) throw new LiveSessionError(error.message);

  // If the incoming player was listed as sitting out that round, they did not
  // sit — they played. Correct the sit-out record, otherwise they are treated
  // as rested (can't sit next round, sit-out count one too high) and end up
  // with an extra game later. The player they replaced sat out instead, unless
  // they have left the session.
  const r = session.rounds[round - 1];
  if (r && r.sitOuts.includes(playerId)) {
    const gone = withdrawnIds(session);
    const stillOnCourt = moved.rounds[round - 1].matches.some((m) =>
      [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].includes(replacedId ?? ''));
    const replacedSits = !!replacedId && !gone.has(replacedId) && !stillOnCourt;
    const sitOuts = r.sitOuts.filter((id) => id !== playerId).concat(replacedSits ? [replacedId!] : []);
    const { error: sErr } = await supabaseAdmin.from('live_rounds')
      .update({ sit_outs: sitOuts }).eq('session_id', sessionId).eq('round', round);
    if (sErr) throw new LiveSessionError(sErr.message);

    const inc = session.players[playerId];
    await supabaseAdmin.from('live_session_players').update({
      sit_outs: Math.max(0, inc.sitOuts - 1),
      ...(latest ? { sat_last_round: false } : {}),
    }).eq('id', playerId);
    if (replacedSits) {
      const out = session.players[replacedId!];
      await supabaseAdmin.from('live_session_players').update({
        sit_outs: out.sitOuts + 1,
        ...(latest ? { sat_last_round: true } : {}),
      }).eq('id', replacedId!);
    }
  }

  // The override may have changed who played a scored game, so ratings shift.
  // The engine's override only edits the draw; the stored result carries its
  // own copy of the teams, so update that too — otherwise a swap made after
  // the score was entered credits the game to the wrong person until the next
  // score is saved.
  // An "unknown substitute" mark belonged to the player who has just been
  // replaced by the real one, so it goes with them.
  const withTeams = {
    ...moved,
    results: moved.results.map((g) =>
      g.round === round && g.court === court
        ? { ...g, teamA: match.teamA, teamB: match.teamB, unrated: (g.unrated ?? []).filter((id) => id !== replacedId) }
        : g),
  };
  const gameRow = withTeams.results.find((g) => g.round === round && g.court === court);
  if (gameRow && (session.results.find((g) => g.round === round && g.court === court)?.unrated ?? []).length) {
    await supabaseAdmin.from('live_games').update({ unrated: gameRow.unrated ?? [] })
      .eq('session_id', sessionId).eq('round', round).eq('court', court);
  }
  const rerated = recomputeRatings(withTeams);
  await persistDerivedPlayers(rerated);
  const scored = session.results.find((g) => g.round === round && g.court === court);
  await logEvent({
    session_id: sessionId, round, court, event: 'override', player_id: playerId,
    old_a: scored?.scoreA ?? null, old_b: scored?.scoreB ?? null,
    new_a: scored?.scoreA ?? null, new_b: scored?.scoreB ?? null,
    detail: { slot, from: replacedId ? session.players[replacedId]?.name : null, to: session.players[playerId]?.name,
      pastGame: !latest, ...(opts.force ? { forced: true } : {}) },
  });
  return rerated;
}

/** Undo the most recent round: drop its games, its sit-out row, and re-derive. */
export async function undoLastRound(sessionId: string) {
  const session = await loadSession(sessionId);
  const last = session.rounds.length;
  if (last === 0) throw new LiveSessionError('no rounds to undo');

  for (const g of session.results.filter((x) => x.round === last)) {
    await logEvent({
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
  name: string, roster: { name: string; level: Level }[], seed = 1, courts?: number,
) {
  // Always today's defaults plus the one setting chosen at creation. A config
  // posted by a browser is never stored (see config.ts).
  const config = buildConfig(courts !== undefined ? { courts } : {});
  const { data: s, error } = await writeCompat(
    (row) => supabaseAdmin.from('live_sessions').insert(row).select().single(),
    { name, config, seed, status: 'setup', config_version: CONFIG_VERSION });
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
    registered_level: p.level,
    start_level: p.level,
    rating: p.rating,
    games: p.games,
    sit_outs: p.sitOuts,
    sat_last_round: p.satLastRound,
    beginner: p.beginner,
    above_median_streak: p.aboveMedianStreak,
    history: p.history,
  }));

  for (const row of rows) {
    const { error: pErr } = await writeCompat((r) => supabaseAdmin.from('live_session_players').insert(r), row);
    if (pErr) throw new LiveSessionError(pErr.message);
  }
  return s.id as string;
}

/**
 * Add a player. They start at their level's rating. `inherit` hands them a
 * leaver's sit-out record, so a substitute takes over that player's place in
 * the rotation instead of jumping the queue.
 */
export async function addPlayer(
  sessionId: string, name: string, level: Level,
  opts: { inherit?: Player; actor?: string } = {},
): Promise<string> {
  const session = await loadSession(sessionId);
  const clean = name.trim();
  if (!clean) throw new LiveSessionError('name required');
  if (Object.values(session.players).some((p) => p.name.toLowerCase() === clean.toLowerCase()))
    throw new LiveSessionError(`${clean} is already in this session`);

  const start = session.config.rating.start[level];
  const { data, error } = await writeCompat((row) => supabaseAdmin.from('live_session_players').insert(row).select('id').single(), {
    session_id: sessionId,
    name: clean,
    level,
    registered_level: level,
    start_level: level,
    rating: start,
    games: 0,
    // Joining late should not push them straight to the front of the sit-out
    // queue, nor make them instantly "due" a rest. Match the lowest sit-out
    // count already in the session.
    sit_outs: opts.inherit?.sitOuts ?? Math.min(...Object.values(session.players).map((p) => p.sitOuts), 0),
    sat_last_round: opts.inherit?.satLastRound ?? false,
    beginner: level === 'beginner',
    above_median_streak: 0,
    history: [],
  });
  if (error || !data) throw new LiveSessionError(error?.message ?? 'could not add player');
  // Registrations before the first round are not "changes"; later arrivals are.
  if (session.rounds.length > 0) {
    await logEvent({ session_id: sessionId, event: 'added', round: session.rounds.length + 1,
      actor: opts.actor ?? 'admin', player_id: data.id, detail: { name: clean, level } });
  }
  await nudge(sessionId);
  return (data as { id: string }).id;
}

/**
 * Change a player's name or current level.
 *
 * Before the first round a level change is a registration correction: it
 * sets the starting level too. After that it applies from the next draw and
 * leaves every earlier game as it was (engine changeLevel). Rewriting from
 * game 1 is the separate, deliberate correctStartLevel.
 */
export async function updatePlayer(
  sessionId: string, playerId: string, patch: { name?: string; level?: Level; reason?: string },
) {
  const session = await loadSession(sessionId);
  const p = session.players[playerId];
  if (!p) throw new LiveSessionError('player not in this session');

  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (!clean) throw new LiveSessionError('name cannot be empty');
    if (Object.values(session.players).some(
      (q) => q.id !== playerId && q.name.toLowerCase() === clean.toLowerCase()))
      throw new LiveSessionError(`${clean} is already in this session`);
    const { error } = await supabaseAdmin.from('live_session_players').update({ name: clean }).eq('id', playerId);
    if (error) throw new LiveSessionError(error.message);
  }

  if (patch.level !== undefined && patch.level !== p.level) {
    if (session.rounds.length === 0) {
      const { error } = await writeCompat((row) => supabaseAdmin.from('live_session_players').update(row).eq('id', playerId), {
        level: patch.level, start_level: patch.level, beginner: patch.level === 'beginner',
        rating: session.config.rating.start[patch.level],
      });
      if (error) throw new LiveSessionError(error.message);
      await logEvent({ session_id: sessionId, event: 'level', round: null, player_id: playerId,
        detail: { name: p.name, from: p.level, to: patch.level } });
    } else {
      const next = session.rounds.length + 1;
      const changed = changeLevel(session, playerId, patch.level, next, 'admin', patch.reason);
      await persistLevel(changed.players[playerId]);
      await persistDerivedPlayers(changed);
      await logEvent({ session_id: sessionId, event: 'level', round: next, player_id: playerId,
        detail: { name: p.name, from: p.level, to: patch.level, ...(patch.reason ? { reason: patch.reason } : {}) } });
    }
  }
  await nudge(sessionId);
}

/**
 * "They picked the wrong level at sign-up." Changes the STARTING level and
 * re-rates from game 1, which moves opponents' ratings too — so `preview`
 * returns exactly whose ratings change, and by how much, without saving.
 */
export async function correctStartLevel(sessionId: string, playerId: string, level: Level, preview: boolean) {
  const session = await loadSession(sessionId);
  const p = session.players[playerId];
  if (!p) throw new LiveSessionError('player not in this session');
  const after = engineCorrectStartLevel(session, playerId, level);
  const impact = ratingImpact(session, after);
  if (preview) return { impact, from: p.startLevel ?? p.level, to: level };

  await persistLevel(after.players[playerId]);
  await persistDerivedPlayers(after);
  await logEvent({ session_id: sessionId, event: 'start_level', player_id: playerId,
    detail: { name: p.name, from: p.startLevel ?? p.level, to: level,
      impact: impact.slice(0, 12).map((x) => ({ name: x.name, delta: x.delta })) } });
  await nudge(sessionId);
  return { impact, from: p.startLevel ?? p.level, to: level };
}

/** Lock a level so the automatic review never moves it (or unlock). */
export async function setLevelLock(sessionId: string, playerId: string, locked: boolean) {
  const session = await loadSession(sessionId);
  const p = session.players[playerId];
  if (!p) throw new LiveSessionError('player not in this session');
  const { error } = await supabaseAdmin.from('live_session_players').update({ level_locked: locked }).eq('id', playerId);
  if (error) throw new LiveSessionError(error.message);
  await logEvent({ session_id: sessionId, event: 'level_lock', player_id: playerId, detail: { name: p.name, locked } });
  await nudge(sessionId);
}

export type Substitute = { player_id: string } | { name: string; level: Level };

/**
 * A player leaves, optionally with someone playing in their place.
 *
 *  - Substitute = an existing player: if the leaver is on court now, the
 *    substitute is swapped into their slot (sit-outs corrected by overrideSlot).
 *  - Substitute = a new guest: added with the leaver's sit-out record, so they
 *    take over the leaver's future draws, then swapped in as above.
 *  - No one: refused while the leaver is on court (a court can't have a gap).
 *
 * Anyone who has been drawn keeps their row, marked as left: their games feed
 * other players' ratings. Someone never drawn is deleted.
 */
export async function withdrawPlayer(
  sessionId: string, playerId: string, sub?: Substitute, opts: { force?: boolean } = {},
) {
  const session = await loadSession(sessionId);
  const p = session.players[playerId];
  if (!p) throw new LiveSessionError('player not in this session');
  const gone = withdrawnIds(session);

  // Only an unplayed game needs someone in their slot; a scored one is history
  // (fix that with "Played by someone else" if a substitute played it).
  const current = session.rounds[session.rounds.length - 1];
  const match = current?.matches.find((m) => onCourt(m).includes(playerId)
    && !session.results.some((g) => g.round === current.index && g.court === m.court));
  const slot = match ? (['A.a', 'A.b', 'B.a', 'B.b'] as const)[onCourt(match).indexOf(playerId)] : undefined;

  let subId: string | undefined;
  if (sub && 'player_id' in sub) {
    const q = session.players[sub.player_id];
    if (!q || q.id === playerId || gone.has(q.id)) throw new LiveSessionError('pick someone who is here to play');
    if (match && onCourt(match).includes(q.id)) throw new LiveSessionError(`${q.name} is already on that court`);
    subId = q.id;
  }
  if (match && !sub) {
    throw new LiveSessionError(
      `${p.name} is on court ${match.court} this round — choose who is playing in their place, or undo the round`);
  }
  if (sub && 'name' in sub) {
    subId = await addPlayer(sessionId, sub.name, sub.level, { inherit: p });
  }
  if (match && subId) await overrideSlot(sessionId, current.index, match.court, slot!, subId, opts);

  const appeared = session.rounds.some((r) => r.sitOuts.includes(playerId) || r.matches.some((m) => onCourt(m).includes(playerId)));
  if (appeared) {
    const { data: cur } = await supabaseAdmin.from('live_sessions').select('config').eq('id', sessionId).single();
    const cfg: any = cur?.config ?? {};
    const ids = new Set<string>(cfg.withdrawn ?? []); ids.add(playerId);
    const { error } = await supabaseAdmin.from('live_sessions')
      .update({ config: { ...cfg, withdrawn: [...ids] } }).eq('id', sessionId);
    if (error) throw new LiveSessionError(error.message);
  } else {
    const { error } = await supabaseAdmin.from('live_session_players').delete().eq('id', playerId);
    if (error) throw new LiveSessionError(error.message);
  }
  const round = session.rounds.length || null;
  await logEvent({ session_id: sessionId, event: appeared ? 'left' : 'removed', round, player_id: playerId, detail: { name: p.name } });
  if (subId) {
    const subName = sub && 'name' in sub ? sub.name.trim() : session.players[subId].name;
    await logEvent({ session_id: sessionId, event: 'substitute', round, player_id: subId,
      detail: { leaver: p.name, substitute: subName, newGuest: !!(sub && 'name' in sub) } });
  }
  await nudge(sessionId);
}

/** Remove a player with nobody in their place (kept for the DELETE route). */
export const removePlayer = (sessionId: string, playerId: string) => withdrawPlayer(sessionId, playerId);

/**
 * "Unknown substitute": someone played this game in `playerId`'s place and
 * nobody knows who. The game stays in the draw history (partners/opponents)
 * but no longer touches `playerId`'s rating. `on: false` reverses it.
 */
export async function markUnknownSubstitute(
  sessionId: string, round: number, court: number, playerId: string, on = true,
) {
  const session = await loadSession(sessionId);
  const g = session.results.find((x) => x.round === round && x.court === court);
  if (!g) throw new LiveSessionError(`no scored game on court ${court} in round ${round}`);
  if (!onCourt(g).includes(playerId)) throw new LiveSessionError('that player was not in this game');
  const unrated = on ? [...new Set([...(g.unrated ?? []), playerId])] : (g.unrated ?? []).filter((x) => x !== playerId);
  const { error } = await supabaseAdmin.from('live_games').update({ unrated })
    .eq('session_id', sessionId).eq('round', round).eq('court', court);
  if (error) throw new LiveSessionError(error.message);
  const rerated = recomputeRatings({ ...session,
    results: session.results.map((x) => (x === g ? { ...x, unrated } : x)) });
  await persistDerivedPlayers(rerated);
  await logEvent({ session_id: sessionId, event: 'unknown_substitute', round, court, player_id: playerId,
    detail: { name: session.players[playerId]?.name, on } });
  await nudge(sessionId);
  return rerated;
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

/** Finish the session: closes registration, and /live/latest stops pointing at it. */
export async function finishSession(sessionId: string, actor = 'admin', reason?: string) {
  const { data, error: rErr } = await supabaseAdmin.from('live_sessions').select('config,status').eq('id', sessionId).single();
  if (rErr || !data) throw new LiveSessionError(rErr?.message ?? 'session not found');
  if (data.status === 'finished') return;
  const { error } = await supabaseAdmin.from('live_sessions')
    .update({ status: 'finished', config: { ...(data.config as any), registrationOpen: false } })
    .eq('id', sessionId).neq('status', 'finished');
  if (error) throw new LiveSessionError(error.message);
  await logEvent({ session_id: sessionId, event: 'finish', actor, detail: reason ? { reason } : {} });
}

/** Undo a finish. Registration stays closed until an admin opens it. */
export async function reopenSession(sessionId: string) {
  const { error } = await supabaseAdmin.from('live_sessions').update({ status: 'live' })
    .eq('id', sessionId).eq('status', 'finished');
  if (error) throw new LiveSessionError(error.message);
  await logEvent({ session_id: sessionId, event: 'reopen' });
}

/* ── Session metadata, registration, nudges, change log ────────────────── */

export interface SessionMeta {
  name: string;
  status: 'setup' | 'live' | 'finished';
  registrationOpen: boolean;
  createdAt: string;
  /** Which DEFAULT_CONFIG the session was built from; null = before versioning. */
  configVersion: number | null;
  latestConfigVersion: number;
  lastScoreAt: string | null;
  lastActivityAt: string;
}

/** Name, status and registration state — kept out of the engine's Session. */
export async function loadMeta(sessionId: string): Promise<SessionMeta> {
  const [{ data, error }, scores, any] = await Promise.all([
    supabaseAdmin.from('live_sessions').select('*').eq('id', sessionId).single(),
    supabaseAdmin.from('live_score_log').select('created_at').eq('session_id', sessionId).eq('event', 'score')
      .order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('live_score_log').select('created_at').eq('session_id', sessionId)
      .order('created_at', { ascending: false }).limit(1),
  ]);
  if (error || !data) throw new LiveSessionError(`session not found: ${error?.message ?? sessionId}`);
  const lastScoreAt = (scores.data?.[0]?.created_at as string | undefined) ?? null;
  const lastLog = (any.data?.[0]?.created_at as string | undefined) ?? null;
  return {
    name: data.name,
    status: data.status,
    // Stored in the config jsonb so no schema change is needed. Absent = open,
    // which is how every session created before this change behaves.
    registrationOpen: (data.config as any)?.registrationOpen !== false,
    createdAt: data.created_at,
    configVersion: data.config_version ?? null,
    latestConfigVersion: CONFIG_VERSION,
    lastScoreAt,
    lastActivityAt: [lastLog, data.created_at].filter(Boolean).sort().at(-1)!,
  };
}

export const AUTO_FINISH_HOURS = 6;

/**
 * A session still 'live' 6 hours after its last score (or its creation, if
 * nothing was ever scored) is finished automatically, logged as "system".
 * Checked whenever the session is loaded, so no cron is needed.
 */
export async function autoFinishIfStale(sessionId: string, meta: SessionMeta, now = Date.now()): Promise<SessionMeta> {
  if (meta.status !== 'live') return meta;
  const since = meta.lastScoreAt ?? meta.createdAt;
  const idleH = (now - new Date(since).getTime()) / 3_600_000;
  if (idleH < AUTO_FINISH_HOURS) return meta;
  await finishSession(sessionId, 'system', `no score for ${Math.floor(idleH)} hours`);
  return { ...meta, status: 'finished', registrationOpen: false };
}

export async function setRegistrationOpen(sessionId: string, open: boolean) {
  const { data, error } = await supabaseAdmin
    .from('live_sessions').select('config').eq('id', sessionId).single();
  if (error || !data) throw new LiveSessionError(error?.message ?? 'session not found');
  const { error: uErr } = await supabaseAdmin
    .from('live_sessions').update({ config: { ...(data.config as any), registrationOpen: open } }).eq('id', sessionId);
  if (uErr) throw new LiveSessionError(uErr.message);
  await logEvent({ session_id: sessionId, event: 'registration', detail: { open } });
}

/** Read-modify-write one server-owned key in the config jsonb. */
async function updateConfigKey(sessionId: string, fn: (cfg: any) => any) {
  const { data, error } = await supabaseAdmin.from('live_sessions').select('config').eq('id', sessionId).single();
  if (error || !data) throw new LiveSessionError(error?.message ?? 'session not found');
  const { error: uErr } = await supabaseAdmin.from('live_sessions').update({ config: fn(data.config ?? {}) }).eq('id', sessionId);
  if (uErr) throw new LiveSessionError(uErr.message);
}

/**
 * Needs-attention decisions.
 *  - dismiss: hide an item (Keep, Dismiss).
 *  - undo: reverse the latest automatic level change for a player, and never
 *    make that move automatically again this session.
 *  - apply: an admin accepts a suggested move (suggest-only mode).
 */
export async function attention(sessionId: string, body: {
  action: 'dismiss' | 'undo' | 'apply'; key?: string; text?: string; player_id?: string; to?: Level;
}) {
  if (body.action === 'dismiss') {
    if (!body.key) throw new LiveSessionError('key required');
    await updateConfigKey(sessionId, (c) => ({ ...c, dismissed: [...new Set([...(c.dismissed ?? []), body.key])] }));
    await logEvent({ session_id: sessionId, event: 'attention', detail: { key: body.key, text: body.text ?? null } });
    return nudge(sessionId);
  }
  if (!body.player_id) throw new LiveSessionError('player_id required');
  if (body.action === 'apply') {
    if (!body.to) throw new LiveSessionError('level required');
    return updatePlayer(sessionId, body.player_id, { level: body.to, reason: 'suggested by level review' });
  }
  const session = await loadSession(sessionId);
  const p = session.players[body.player_id];
  const last = p?.levelChanges?.at(-1);
  if (!p || !last || last.by !== 'system') throw new LiveSessionError('no automatic change to undo for that player');
  const players = { ...session.players, [p.id]: { ...p, level: last.from, beginner: last.from === 'beginner',
    levelChanges: p.levelChanges!.slice(0, -1) } };
  const rerated = recomputeRatings({ ...session, players });
  await persistLevel(rerated.players[p.id]);
  await persistDerivedPlayers(rerated);
  await updateConfigKey(sessionId, (c) => ({ ...c,
    blockedMoves: [...new Set([...(c.blockedMoves ?? []), `${p.id}:${last.to}`])] }));
  await logEvent({ session_id: sessionId, event: 'level', round: last.beforeRound, player_id: p.id,
    detail: { name: p.name, from: last.to, to: last.from, reason: 'automatic change undone' } });
  await nudge(sessionId);
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

/**
 * Append to the change log (live_score_log). Never throws: a logging failure
 * must not stop a score being saved mid-session. Columns added by migration
 * 011 are only sent when used, so score logging keeps working before it runs.
 */
export async function logEvent(entry: {
  session_id: string; event: LogEvent; round?: number | null; court?: number | null;
  actor?: string; player_id?: string | null;
  old_a?: number | null; old_b?: number | null; new_a?: number | null; new_b?: number | null;
  detail?: Record<string, unknown>;
}): Promise<string | null> {
  // Record the signed-in staff member when the caller didn't name an actor.
  const actor = entry.actor ?? currentActor();
  const row: Record<string, unknown> = { ...entry, actor, round: entry.round ?? null, court: entry.court ?? null };
  if (!actor || actor === 'admin') delete row.actor;
  if (!entry.player_id) delete row.player_id;
  try {
    const { error } = await supabaseAdmin.from('live_score_log').insert(row);
    if (error) { console.error('[change-log]', error.message); return error.message; }
    return null;
  } catch (e) {
    console.error('[change-log]', (e as Error).message);
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
  await logEvent({ session_id: sessionId, event: 'rejoined', round: session.rounds.length + 1, player_id: playerId,
    detail: { name: session.players[playerId]?.name } });
  await nudge(sessionId);
}

/** Case- and space-insensitive name key, for matching returning players. */
export const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Admin-only: each player's level from their most recent earlier session
 * (matched by name until player accounts exist), and any level moves there.
 */
export async function previousLevels(sessionId: string) {
  const { data: me } = await supabaseAdmin.from('live_sessions').select('created_at').eq('id', sessionId).single();
  if (!me) return {};
  const [{ data: mine }, { data: prev }] = await Promise.all([
    supabaseAdmin.from('live_session_players').select('id,name').eq('session_id', sessionId),
    supabaseAdmin.from('live_sessions').select('id,name,created_at').lt('created_at', me.created_at)
      .order('created_at', { ascending: false }).limit(20),
  ]);
  if (!mine?.length || !prev?.length) return {};
  const { data: rows } = await supabaseAdmin.from('live_session_players')
    .select('*').in('session_id', prev.map((s) => s.id));
  const order = new Map(prev.map((s, i) => [s.id, i]));
  const byName = new Map<string, any>();
  for (const r of [...(rows ?? [])].sort((a, b) => order.get(a.session_id)! - order.get(b.session_id)!)) {
    if (!byName.has(nameKey(r.name))) byName.set(nameKey(r.name), r);
  }
  const out: Record<string, { session: string; date: string; level: Level; registered: Level;
    moves: { from: Level; to: Level; beforeRound: number; by: string }[] }> = {};
  for (const p of mine) {
    const r = byName.get(nameKey(p.name));
    if (!r) continue;
    const s = prev.find((x) => x.id === r.session_id)!;
    out[p.id] = { session: s.name, date: s.created_at, level: r.level, registered: r.registered_level ?? r.level,
      moves: (r.level_history ?? []).map((h: any) => ({ from: h.from, to: h.to, beforeRound: h.beforeRound, by: h.by })) };
  }
  return out;
}
