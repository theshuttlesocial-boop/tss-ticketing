-- ============================================================
-- Migration 013: player PINs, so players never lose their page
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- 1. live_session_players.pin_hash: a salted scrypt hash of the 4-digit PIN
--    shown at registration. The PIN itself is never stored. This table has
--    no anon read access (migration 006), so the hash is server-only.
-- 2. live_pin_attempts: failed "Already registered?" tries, for the limit of
--    5 per name per 10 minutes. Service role only (RLS on, no policies).
--    Holds a lower-cased name and a time; rows older than a day are deleted
--    by the server as it goes.
-- 3. Change log: allow 'pin_reset' (organiser issued a new PIN).
-- ============================================================

ALTER TABLE live_session_players ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE TABLE IF NOT EXISTS live_pin_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  name_key   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_pin_attempts_lookup
  ON live_pin_attempts(session_id, name_key, created_at DESC);
ALTER TABLE live_pin_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE live_score_log DROP CONSTRAINT IF EXISTS live_score_log_event_check;
ALTER TABLE live_score_log ADD  CONSTRAINT live_score_log_event_check CHECK (event IN (
  'score','undo','override',
  'level','start_level','level_lock',
  'added','left','removed','rejoined',
  'substitute','unknown_substitute',
  'finish','reopen','registration','config',
  'attention',
  'pin_reset'
));
