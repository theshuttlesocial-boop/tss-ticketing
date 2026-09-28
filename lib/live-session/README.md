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

## Still to tune
K schedule, clip range, movement cap, swap limits, level-review thresholds
(see the simulation output before changing defaults).
