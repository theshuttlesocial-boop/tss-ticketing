-- ============================================================
-- Migration 006: hide player ratings from the public
-- Run in Supabase SQL Editor
--
-- Migration 005 gave anon SELECT on all four live_* tables so the board and
-- player pages could work without a login. That also let anyone holding the
-- public anon key (it ships in the browser bundle) read every player's rating,
-- level and game count straight from the REST API.
--
-- Ratings are now served only through /api/live/*, which uses the service role
-- and redacts them for non-admin callers.
-- ============================================================

-- Drop the blanket read policy on the players table.
DROP POLICY IF EXISTS live_session_players_anon_read ON live_session_players;

-- live_sessions / live_games / live_rounds keep their anon read policies:
-- they carry court assignments and scores, which are public by nature — they
-- are called out across the hall. They contain no ratings.
--
-- The board and player pages do not query live_session_players directly; they
-- read /api/live/[id], which runs as the service role and strips what the
-- caller is not entitled to see.
--
-- Realtime: clients no longer receive change events for live_session_players.
-- This is fine. Every rating change is caused by a score write, which touches
-- live_games, and that event still fires a refetch.
