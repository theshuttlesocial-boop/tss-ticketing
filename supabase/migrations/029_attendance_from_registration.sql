-- ============================================================
-- Migration 029: attendance from live-session registration
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Who attended a session is now whoever is registered in that night's live
-- session (players scan the QR and enter their name; staff can add anyone
-- else). That counts plus-ones individually, unlike booking check-in, which
-- this replaces.
--
-- 1. live_sessions.ticket_session_id: which booking session a live session
--    belongs to. Set when the live session is created; past nights are linked
--    below where there was exactly one booking session that UK date.
-- 2. live_player_emails: the optional email a player gave when registering.
--    Kept in its own table, server only (RLS on, no policies), so emails can
--    never become readable with the public key, even if an older migration
--    that re-opens live_session_players to public reads is ever re-run.
-- ============================================================

-- 1. Link live sessions to booking sessions --------------------------------
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS ticket_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_live_sessions_ticket ON live_sessions(ticket_session_id);

UPDATE live_sessions ls
   SET ticket_session_id = s.id
  FROM sessions s
 WHERE ls.ticket_session_id IS NULL
   AND s.date = (ls.created_at AT TIME ZONE 'Europe/London')::date
   AND s.status <> 'cancelled'
   AND NOT COALESCE(s.cancelled_occurrence, false)
   AND (SELECT count(*) FROM sessions s2
         WHERE s2.date = s.date
           AND s2.status <> 'cancelled'
           AND NOT COALESCE(s2.cancelled_occurrence, false)) = 1;

-- 2. Private emails for registered players ---------------------------------
CREATE TABLE IF NOT EXISTS live_player_emails (
  live_player_id UUID PRIMARY KEY REFERENCES live_session_players(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,            -- stored lower-case
  added_by       TEXT,                     -- 'player', or the staff email that added them
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_player_emails_email ON live_player_emails (email);
ALTER TABLE live_player_emails ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) can read or write.
