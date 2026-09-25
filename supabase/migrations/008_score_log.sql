-- ============================================================
-- Migration 008: score-edit log
-- Run in Supabase SQL Editor
--
-- Append-only record of every score entered or corrected, every undone round
-- and every manual slot override, so a disputed result can be traced.
-- Nothing reads or writes it except the server (service role).
-- ============================================================

CREATE TABLE IF NOT EXISTS live_score_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,
  court      INTEGER NOT NULL,
  event      TEXT NOT NULL CHECK (event IN ('score','undo','override')),
  old_a      INTEGER,
  old_b      INTEGER,
  new_a      INTEGER,
  new_b      INTEGER,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_score_log_session
  ON live_score_log(session_id, created_at DESC);

-- Service role only: no policies, so anon and authenticated see nothing.
ALTER TABLE live_score_log ENABLE ROW LEVEL SECURITY;
