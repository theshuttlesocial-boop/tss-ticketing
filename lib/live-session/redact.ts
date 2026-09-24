/**
 * Strips everything a player is not entitled to see from a Session.
 *
 * Kept as a pure function so it is testable and so there is exactly one
 * definition of "what is public", rather than the answer being spread across
 * three pages.
 *
 * Public: names, court assignments, scores, who is sitting out.
 * Private: ratings, rating history, levels, games played, sit-out counts,
 *          promotion state, and the session's tuning config.
 */
import type { Player, Session } from './engine';

/** A player as the public sees them. */
export type PublicPlayer = Pick<Player, 'id' | 'name'>;

export interface PublicSession extends Omit<Session, 'players' | 'config'> {
  players: Record<string, PublicPlayer>;
  /** Courts only — the rest of the tuning config is not public. */
  config: { rotation: { courts: number } };
}

export function redactSession(s: Session): PublicSession {
  const players: Record<string, PublicPlayer> = {};
  for (const p of Object.values(s.players)) players[p.id] = { id: p.id, name: p.name };
  return {
    players,
    rounds: s.rounds,
    results: s.results,
    seed: 0, // not secret, but no reason to publish it
    config: { rotation: { courts: s.config.rotation.courts } },
  };
}

/**
 * One player's own view: their result history, but nobody else's numbers.
 * Rating is included because it is theirs; opponents' ratings are not.
 */
export function playerView(s: Session, playerId: string) {
  const me = s.players[playerId];
  if (!me) return null;
  return {
    id: me.id,
    name: me.name,
    rating: me.rating,
    history: me.history,
    startRating: s.config.rating.start[me.level],
    ...redactSession(s),
    players: Object.fromEntries(
      Object.values(s.players).map((p) => [p.id, { id: p.id, name: p.name }]),
    ),
  };
}
