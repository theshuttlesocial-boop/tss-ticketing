# Live Session — rating engine + rotation solver

Vendored from the standalone `tss-live` project. Pure functions, no framework
dependencies.

**Do not edit `engine/` to change app behaviour.** It is a verbatim copy of the
upstream engine so it can be re-synced. App-specific code (Supabase mapping,
server actions) belongs in this directory, alongside it.

## Layout
- `engine/types.ts`    — domain types and `DEFAULT_CONFIG` (all tunable values)
- `engine/rating.ts`   — expected share, K schedule, per-game deltas, promotion
- `engine/rotation.ts` — sit-outs → sort → courts → beginner ceiling → movement
                         cap → pair split by cost → neighbour swap
- `engine/finals.ts`   — confidence-adjusted rating, tie-breaks, grand final
- `engine/session.ts`  — immutable state: `createSession`, `nextRound`,
                         `recordScore`, `overrideSlot`, `recomputeRatings`
- `*.test.ts`          — 17 unit tests, every worked example from the design doc

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
field is derived.

## Still to tune after two live sessions
K schedule, beginner start, clip range, promotion threshold, movement cap.
