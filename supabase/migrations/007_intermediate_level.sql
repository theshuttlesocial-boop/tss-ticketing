-- ============================================================
-- Migration 007: add the 'intermediate' level
-- Run in Supabase SQL Editor
--
-- Four rungs instead of three. The gap between "played a few times" and
-- "plays regularly" was doing too much work as a single 'standard' level.
-- ============================================================

ALTER TABLE live_session_players
  DROP CONSTRAINT IF EXISTS live_session_players_level_check;

ALTER TABLE live_session_players
  ADD CONSTRAINT live_session_players_level_check
  CHECK (level IN ('beginner','standard','intermediate','strong'));
