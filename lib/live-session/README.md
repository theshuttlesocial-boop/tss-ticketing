# Live Session — rating engine + rotation solver

Vendored from the standalone `tss-live` project. Pure functions, no framework
dependencies.

`engine/` started as a copy of the upstream `tss-live` engine but has since
diverged (hard strong/beginner rule, swap limits, level review), so it is now
maintained here. Keep it pure: no I/O, no framework imports. App-specific code
(Supabase mapping, server actions) belongs in this directory, alongside it.

## Layout
- `engine/types.ts`    — domain types, `DEFAULT_CONFIG` (all tunable values),
                         `CONFIG_VERSION`, `normaliseConfig`
- `engine/rating.ts`   — expected share, K schedule, per-game deltas, level bands
- `engine/rotation.ts` — sit-outs → sort → courts → beginner ceiling → movement
                         cap → neighbour swap (max 1 court from rating block,
                         max +25 team gap) → strong/beginner hard rule → pair
                         split by cost (lone-beginner pairing)
- `engine/review.ts`   — automatic level review, mismatched-game flags
- `engine/finals.ts`   — confidence-adjusted rating, tie-breaks, grand final
- `engine/session.ts`  — immutable state: `createSession`, `nextRound`,
                         `recordScore`, `overrideSlot`, `replay` /
                         `recomputeRatings`, `changeLevel`, `correctStartLevel`
- `config.ts`          — builds a session's config server-side from the
                         defaults + allowed admin overrides
- `changeLog.ts`       — plain-English lines for the admin Log tab
- `fixtures.ts`        — loads `/fixtures/session-8x.json` for regression tests
- `*.test.ts`          — unit tests + Session 88/89 replays

## Levels
Each session player has `registered_level` (what they picked, never changes),
`start_level` (sets the starting rating) and `level` (current: drives the
strong/beginner rules). A mid-session change is appended to `level_history`
and applies from the next round; earlier games are replayed exactly as played.
"Correct starting level" is the separate action that re-rates from game 1.

## Scripts
```
npx tsx scripts/simulate-rotation.ts   # swap limits + level review, 200 sessions each
npx tsx scripts/session89-review.ts    # Session 89 replayed with level review on
```

## Run the tests
```
npx tsx --test lib/live-session/*.test.ts
```

## Mapping to Supabase
| Engine                | Table                                        |
|-----------------------|----------------------------------------------|
| `Session.config`, `seed` | `live_sessions`                           |
| `Session.players`     | `live_session_players`                       |
| `Session.rounds`      | `live_games` (assignments) + `live_rounds` (sit-outs) |
| `Session.results`     | `live_games` rows with non-null scores       |

Ratings are recomputed from the ordered game rows on every write, so a
corrected score just replaces the row.

Note the engine keeps unscored assignments (`rounds`) separate from scored
results (`results`); `live_games` holds both, distinguished by null scores.
Only `sitOuts` and `satLastRound` survive a recompute — every other player
field is derived from (start level, level history, results).
`live_games.unrated` lists players an unknown substitute played for; the game
counts for the other three only.

## v3 matching (October 2026, after Session 90)
New sessions (CONFIG_VERSION 3); sessions created earlier keep v2 (settings they
predate are off in `normaliseConfig`), so they replay exactly as played.
- **Level first**: courts fill by level (strong → beginner), rating orders players
  within a level. A level change (admin, or level review) moves someone between tiers.
- **Even boundary**: no court of 3 of one level + 1 of the level below; the weakest
  of the three drops a court, so the mixed court plays St+I v St+I.
- **Same-level swaps**: the repeat-avoiding swap (and the movement cap) only trade
  players of the same level.
- **Pairing costs**: `levelGap` (teams' combined levels differ, e.g. St+St v I+I) and
  `widePair` (partners 2+ levels apart: I+B, St+Sd, St+B). A beginner partners a standard.
- **Ratings**: court-strength weighting (`rating.courtWeight`: wins against stronger
  opposition than the session average count for more, against weaker for less; losses
  mirror it), K 220/220/160/160/120 (was 300/300/220/220/160), divisor 700 (was 1000).

`npx tsx scripts/matching-v3-eval.ts` compares v2 and v3 on Sessions 88-90
(fixtures are anonymised for Session 90). Results at the time: rating prediction
error 9.4 → 8.9 points of share; draws judged with hindsight ratings: imbalance
7.9% → 6.5%, games 60/40 or worse 33 → 23 of 104, 3+1 courts 28 → 12, partners 2+
levels apart 36 → 12, intermediates on a beginner's court 5 → 0.

## Still to tune
K schedule, clip range, movement cap, swap limits, level-review thresholds
(see the simulation output before changing defaults).
