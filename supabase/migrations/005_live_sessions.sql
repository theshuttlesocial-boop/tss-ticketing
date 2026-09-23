-- ============================================================
-- Migration 005: Live Session module
-- Run in Supabase SQL Editor
--
-- Four tables backing the rating/rotation engine in lib/live-session.
-- Mapping (see lib/live-session/README.md):
--   Session.config, seed  -> live_sessions
--   Session.players       -> live_session_players
--   Session.rounds        -> live_games (assignments) + live_rounds (sit-outs)
--   Session.results       -> live_games rows with non-null scores
-- ============================================================

-- 1. SESSIONS ------------------------------------------------
CREATE TABLE IF NOT EXISTS live_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name       TEXT NOT NULL,
  config     JSONB NOT NULL,          -- engine Config; DEFAULT_CONFIG on create
  seed       INTEGER NOT NULL DEFAULT 1,
  status     TEXT NOT NULL DEFAULT 'setup'
             CHECK (status IN ('setup','live','finished'))
);

-- 2. PLAYERS -------------------------------------------------
-- No existing `players` table in this schema, so the roster is stored by name.
-- Split into two groups with different write paths:
--   * sit_outs / sat_last_round  — advanced by nextRound, survive a recompute
--   * everything else            — derived, rebuilt by recomputeRatings
CREATE TABLE IF NOT EXISTS live_session_players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  level               TEXT NOT NULL
                      CHECK (level IN ('beginner','standard','strong')),
  rating              NUMERIC NOT NULL DEFAULT 1000,
  games               INTEGER NOT NULL DEFAULT 0,
  sit_outs            INTEGER NOT NULL DEFAULT 0,
  sat_last_round      BOOLEAN NOT NULL DEFAULT false,
  beginner            BOOLEAN NOT NULL DEFAULT false,
  above_median_streak INTEGER NOT NULL DEFAULT 0,
  history             JSONB   NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT live_session_players_unique_name UNIQUE (session_id, name)
);

-- 3. GAMES ---------------------------------------------------
-- One row per court per round. NULL scores = assigned but not yet played.
-- team_a / team_b are {"a": <player uuid>, "b": <player uuid>}.
CREATE TABLE IF NOT EXISTS live_games (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL CHECK (round >= 1),
  court      INTEGER NOT NULL CHECK (court >= 1),
  team_a     JSONB NOT NULL,
  team_b     JSONB NOT NULL,
  score_a    INTEGER,
  score_b    INTEGER,
  CONSTRAINT live_games_unique_slot UNIQUE (session_id, round, court),
  -- A game is either unscored or fully scored; never half-entered.
  CONSTRAINT live_games_scores_paired
    CHECK ((score_a IS NULL) = (score_b IS NULL))
);

-- 4. ROUNDS --------------------------------------------------
-- Sit-outs belong to the round, not to any court, so they get their own row.
CREATE TABLE IF NOT EXISTS live_rounds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL CHECK (round >= 1),
  sit_outs   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of player uuids
  CONSTRAINT live_rounds_unique_round UNIQUE (session_id, round)
);

-- 5. INDEXES -------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_live_players_session ON live_session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_live_games_session   ON live_games(session_id, round, court);
CREATE INDEX IF NOT EXISTS idx_live_rounds_session  ON live_rounds(session_id, round);

-- 6. REALTIME ------------------------------------------------
-- The TV/board and player pages subscribe to these.
-- Idempotent: ALTER PUBLICATION ... ADD TABLE errors if the table is already
-- a member, so this migration can be re-run safely.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['live_sessions','live_session_players','live_games','live_rounds']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 7. ROW LEVEL SECURITY --------------------------------------
-- Anon: read-only, so the board and player pages work without a login.
-- Writes: no policy granted, so only the service role (supabaseAdmin, behind
-- the ADMIN_SECRET header) can insert/update/delete. Same pattern as
-- blocked_emails, which relies on service-role bypass rather than a policy.
ALTER TABLE live_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_games           ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_rounds          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_sessions_anon_read        ON live_sessions;
DROP POLICY IF EXISTS live_session_players_anon_read ON live_session_players;
DROP POLICY IF EXISTS live_games_anon_read           ON live_games;
DROP POLICY IF EXISTS live_rounds_anon_read          ON live_rounds;

CREATE POLICY live_sessions_anon_read        ON live_sessions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY live_session_players_anon_read ON live_session_players
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY live_games_anon_read           ON live_games
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY live_rounds_anon_read          ON live_rounds
  FOR SELECT TO anon, authenticated USING (true);
