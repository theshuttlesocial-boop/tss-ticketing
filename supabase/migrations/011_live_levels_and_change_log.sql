-- ============================================================
-- Migration 011: live sessions — level history, substitutes,
-- config version, change log
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Numbered 011 because 009/010 are taken by the spot-release work.
--
-- 1. live_session_players: what they picked (registered_level), what sets
--    their starting rating (start_level), and a history of mid-session level
--    changes. `level` stays and is the CURRENT level.
-- 2. live_games.unrated: slots an unknown substitute played, so the game
--    doesn't touch that player's rating.
-- 3. live_sessions.config_version: which DEFAULT_CONFIG a session was built
--    from (NULL = before versioning).
-- 4. live_score_log becomes the change log: more event types, an actor
--    ('admin' / 'system', later a staff user id), round/court optional.
-- 5. Session 89: record the two level edits made on the night, and that
--    Sarvesh played Kevin's round-7 game (flag only, ratings unchanged).
-- ============================================================

-- 1. PLAYERS -------------------------------------------------
ALTER TABLE live_session_players
  ADD COLUMN IF NOT EXISTS registered_level TEXT,
  ADD COLUMN IF NOT EXISTS start_level      TEXT,
  ADD COLUMN IF NOT EXISTS level_history    JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS level_locked     BOOLEAN NOT NULL DEFAULT false;

UPDATE live_session_players SET registered_level = level WHERE registered_level IS NULL;
UPDATE live_session_players SET start_level      = level WHERE start_level      IS NULL;

ALTER TABLE live_session_players DROP CONSTRAINT IF EXISTS live_session_players_registered_level_check;
ALTER TABLE live_session_players ADD  CONSTRAINT live_session_players_registered_level_check
  CHECK (registered_level IN ('beginner','standard','intermediate','strong'));
ALTER TABLE live_session_players DROP CONSTRAINT IF EXISTS live_session_players_start_level_check;
ALTER TABLE live_session_players ADD  CONSTRAINT live_session_players_start_level_check
  CHECK (start_level IN ('beginner','standard','intermediate','strong'));

-- 2. GAMES ---------------------------------------------------
ALTER TABLE live_games
  ADD COLUMN IF NOT EXISTS unrated JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. SESSIONS ------------------------------------------------
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS config_version INTEGER;

-- 4. CHANGE LOG ----------------------------------------------
ALTER TABLE live_score_log ALTER COLUMN round DROP NOT NULL;
ALTER TABLE live_score_log ALTER COLUMN court DROP NOT NULL;
ALTER TABLE live_score_log
  ADD COLUMN IF NOT EXISTS actor     TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS player_id UUID;

ALTER TABLE live_score_log DROP CONSTRAINT IF EXISTS live_score_log_event_check;
ALTER TABLE live_score_log ADD  CONSTRAINT live_score_log_event_check CHECK (event IN (
  'score','undo','override',                    -- 008
  'level','start_level','level_lock',           -- level changes
  'added','left','removed','rejoined',          -- roster
  'substitute','unknown_substitute',            -- substitutes
  'finish','reopen','registration','config',    -- session
  'attention'                                   -- Needs-attention decisions
));

CREATE INDEX IF NOT EXISTS idx_live_score_log_player ON live_score_log(player_id);

-- RLS unchanged: still enabled with no policies (service role only).
ALTER TABLE live_score_log ENABLE ROW LEVEL SECURITY;

-- 5. SESSION 89 ----------------------------------------------
-- Nikesh K (Beginner -> Intermediate before R3) and Joe Suganthan (Standard ->
-- Intermediate before R6) were changed by an admin on the night. Their stored
-- ratings were computed from game 1 at the new level, so start_level stays the
-- new level and the history entry has "adjust": false: recorded, not re-rated.
-- Every stored rating stays exactly as it is.
UPDATE live_session_players
   SET registered_level = 'beginner',
       level_history = '[{"from":"beginner","to":"intermediate","beforeRound":3,"by":"admin","reason":"Edited on the night; recorded from the Session 89 audit","adjust":false}]'::jsonb
 WHERE session_id = '7bcd30af-8b4a-4f16-8faf-5ca13ef13596'
   AND name = 'Nikesh K'
   AND level_history = '[]'::jsonb;

UPDATE live_session_players
   SET registered_level = 'standard',
       level_history = '[{"from":"standard","to":"intermediate","beforeRound":6,"by":"admin","reason":"Edited on the night; recorded from the Session 89 audit","adjust":false}]'::jsonb
 WHERE session_id = '7bcd30af-8b4a-4f16-8faf-5ca13ef13596'
   AND name = 'Joe Suganthan'
   AND level_history = '[]'::jsonb;

INSERT INTO live_score_log (session_id, round, court, event, actor, player_id, detail, created_at)
SELECT p.session_id, v.before_round, NULL, 'level', 'admin', p.id,
       jsonb_build_object('name', p.name, 'from', v.lvl_from, 'to', v.lvl_to,
                          'note', 'Recorded from the Session 89 audit; time approximate'),
       '2026-09-25 19:00:00+00'::timestamptz
  FROM live_session_players p
  JOIN (VALUES ('Nikesh K', 3, 'beginner', 'intermediate'),
               ('Joe Suganthan', 6, 'standard', 'intermediate')) AS v(name, before_round, lvl_from, lvl_to)
    ON v.name = p.name
 WHERE p.session_id = '7bcd30af-8b4a-4f16-8faf-5ca13ef13596'
   AND NOT EXISTS (SELECT 1 FROM live_score_log l
                    WHERE l.session_id = p.session_id AND l.event = 'level' AND l.player_id = p.id);

-- Kevin Mariyaseelan left mid-session; the organiser confirmed sarveshwar
-- sureshkumar played round 7 (court 2, 24-9) under Kevin's name. Flagged only:
-- the score stays as reference and no rating is recalculated, because ratings
-- move to the persistent rating system later. Round 6 is left as recorded.
INSERT INTO live_score_log (session_id, round, court, event, actor, player_id, detail)
SELECT k.session_id, 7, 2, 'substitute', 'admin', s.id,
       jsonb_build_object('leaver', k.name, 'substitute', s.name, 'recordedOnly', true,
                          'note', 'Confirmed by the organiser after the session')
  FROM live_session_players k
  JOIN live_session_players s ON s.session_id = k.session_id AND s.name = 'sarveshwar sureshkumar'
 WHERE k.session_id = '7bcd30af-8b4a-4f16-8faf-5ca13ef13596'
   AND k.name = 'Kevin Mariyaseelan'
   AND NOT EXISTS (SELECT 1 FROM live_score_log l
                    WHERE l.session_id = k.session_id AND l.event = 'substitute' AND l.round = 7 AND l.court = 2);
