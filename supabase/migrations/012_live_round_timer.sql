-- ============================================================
-- Migration 012: round timer stored on the server
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- The timer used to live only in the admin page's memory, so leaving or
-- reloading the page lost it. Now it belongs to the round, and every view
-- (admin, board, player page) computes the time left from these fields:
--   timer_started_at   when it last started or resumed (NULL = not started)
--   timer_duration_s   the length it was started with
--   timer_paused_at    set while paused
--   timer_remaining_s  seconds left at the last start/resume/pause/+1 min
--
-- live_rounds is already readable by anon (migration 005) and in the realtime
-- publication, so every screen updates live. Nothing here is personal data.
-- Writes remain service-role only (the admin API).
-- ============================================================

ALTER TABLE live_rounds
  ADD COLUMN IF NOT EXISTS timer_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_duration_s  INTEGER,
  ADD COLUMN IF NOT EXISTS timer_paused_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_remaining_s INTEGER;

ALTER TABLE live_rounds DROP CONSTRAINT IF EXISTS live_rounds_timer_duration_check;
ALTER TABLE live_rounds ADD  CONSTRAINT live_rounds_timer_duration_check
  CHECK (timer_duration_s IS NULL OR timer_duration_s BETWEEN 30 AND 3600);
