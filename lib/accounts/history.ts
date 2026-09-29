/**
 * A player's history across live sessions: every game, per-session rating,
 * head-to-head per opponent and best partners. Pure, so it's tested without a
 * database (history.test.ts).
 *
 * People are keyed by their account when linked, otherwise by name, so the
 * same regular is recognised across sessions.
 *
 * Privacy: this only ever returns YOUR ratings. Another player's rating is
 * included only when both of you have opted in to the public leaderboard.
 */

export interface SessionInput {
  sessionId: string;
  name: string;
  date: string;              // ISO
  me: string;                // my live_session_players id in this session
  myRating: number;          // rating at the end of the session
  myStart: number;           // starting rating in that session
  games: { round: number; court: number; teamA: { a: string; b: string }; teamB: { a: string; b: string };
    scoreA: number; scoreB: number; unrated?: string[] }[];
  /** Everyone in that session: display name, account id if linked, rating if they've opted in (and so have I). */
  people: Record<string, { name: string; accountId: string | null; rating?: number }>;
}

export interface GameLine {
  round: number; court: number; partner: string; opponents: [string, string];
  my: number; their: number; result: 'W' | 'L' | 'D';
}

export interface Tally { key: string; name: string; games: number; won: number; lost: number; drawn: number; pointsFor: number; pointsAgainst: number; rating?: number }

export interface History {
  sessions: { sessionId: string; name: string; date: string; start: number; end: number; games: GameLine[] }[];
  totals: { sessions: number; games: number; won: number; lost: number; drawn: number };
  headToHead: Tally[];
  partners: Tally[];
}

const personKey = (p: { name: string; accountId: string | null }) =>
  p.accountId ? `acct:${p.accountId}` : `name:${p.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;

export function buildHistory(inputs: SessionInput[]): History {
  const h2h = new Map<string, Tally>(), mates = new Map<string, Tally>();
  const bump = (m: Map<string, Tally>, p: { name: string; accountId: string | null; rating?: number }, my: number, their: number) => {
    const k = personKey(p);
    const t = m.get(k) ?? { key: k, name: p.name, games: 0, won: 0, lost: 0, drawn: 0, pointsFor: 0, pointsAgainst: 0 };
    t.games++; t.pointsFor += my; t.pointsAgainst += their;
    if (my > their) t.won++; else if (my < their) t.lost++; else t.drawn++;
    t.name = p.name; // latest name wins
    if (p.rating !== undefined) t.rating = p.rating;
    m.set(k, t);
  };

  const sessions = [...inputs].sort((a, b) => (a.date < b.date ? -1 : 1)).map((s) => {
    const who = (id: string) => s.people[id] ?? { name: 'Former player', accountId: null };
    const games: GameLine[] = [];
    for (const g of [...s.games].sort((a, b) => a.round - b.round || a.court - b.court)) {
      const inA = g.teamA.a === s.me || g.teamA.b === s.me;
      const inB = g.teamB.a === s.me || g.teamB.b === s.me;
      if (!inA && !inB) continue;
      if ((g.unrated ?? []).includes(s.me)) continue; // someone else played this one for me
      const mine = inA ? g.teamA : g.teamB, theirs = inA ? g.teamB : g.teamA;
      const partner = mine.a === s.me ? mine.b : mine.a;
      const my = inA ? g.scoreA : g.scoreB, their = inA ? g.scoreB : g.scoreA;
      games.push({ round: g.round, court: g.court, partner: who(partner).name,
        opponents: [who(theirs.a).name, who(theirs.b).name], my, their,
        result: my > their ? 'W' : my < their ? 'L' : 'D' });
      bump(mates, who(partner), my, their);
      bump(h2h, who(theirs.a), my, their);
      bump(h2h, who(theirs.b), my, their);
    }
    return { sessionId: s.sessionId, name: s.name, date: s.date, start: s.myStart, end: s.myRating, games };
  });

  const all = sessions.flatMap((s) => s.games);
  const rate = (t: Tally) => (t.won + t.drawn / 2) / t.games;
  return {
    sessions: sessions.reverse(), // newest first
    totals: { sessions: sessions.length, games: all.length,
      won: all.filter((g) => g.result === 'W').length, lost: all.filter((g) => g.result === 'L').length,
      drawn: all.filter((g) => g.result === 'D').length },
    headToHead: [...h2h.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
    // Best partners: at least 2 games together, then win rate, then points difference.
    partners: [...mates.values()].filter((t) => t.games >= 2)
      .sort((a, b) => rate(b) - rate(a) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) || b.games - a.games),
  };
}

/** "Saranya S." */
export const publicName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  const last = rest.join(' ');
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
};
