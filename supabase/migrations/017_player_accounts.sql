-- ============================================================
-- Migration 017: player accounts (Roadmap Phase 4a)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- One account per email, signed in with an emailed 6-digit code (Supabase
-- Auth). Bookings are already stored by email, so they link automatically.
--
-- players: the minimum needed — the email they sign in with, their name, the
-- level they pick and the one an admin sets, and one opt-in (a public
-- leaderboard, OFF by default). No phone number, no date of birth.
-- A player can read only their own row; every write goes through the server.
--
-- live_session_players.player_id: set when a signed-in player joins a live
-- session, so the session appears under "My sessions" with no PIN needed.
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email              TEXT NOT NULL,
  display_name       TEXT,
  first_name         TEXT,
  last_initial       TEXT,
  level_self         TEXT CHECK (level_self  IN ('beginner','standard','intermediate','strong')),
  level_admin        TEXT CHECK (level_admin IN ('beginner','standard','intermediate','strong')),
  leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS players_email_lower_key ON players (lower(email));

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS players_select_own ON players;
CREATE POLICY players_select_own ON players
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

ALTER TABLE live_session_players
  ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES players(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_live_players_player ON live_session_players(player_id);

-- "My sessions" looks bookings up by email.
CREATE INDEX IF NOT EXISTS idx_bookings_email_lower ON bookings (lower(email));
