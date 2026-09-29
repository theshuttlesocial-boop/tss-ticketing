-- ============================================================
-- Migration 023: hide draft sessions from the public key
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- The booking site reads sessions through the server, which already shows
-- only open sessions and scheduled "coming soon" ones. But the public (anon)
-- key could read every draft directly — titles, dates and venues of sessions
-- not yet announced. Now it can read only:
--   - sessions that aren't drafts, and
--   - drafts an admin has chosen to show as "Coming soon", until they open.
--
-- sessions.show_coming_soon: the per-session switch. Set on for drafts that
-- are already scheduled when this first runs, so today's countdowns stay.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'show_coming_soon') THEN
    ALTER TABLE sessions ADD COLUMN show_coming_soon BOOLEAN NOT NULL DEFAULT false;
    UPDATE sessions SET show_coming_soon = true WHERE status = 'draft' AND opens_at > now();
  END IF;
END $$;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Replace whatever read policies exist for the public roles with one rule.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'sessions' AND cmd = 'SELECT' LOOP
    EXECUTE format('DROP POLICY %I ON public.sessions', p.policyname);
  END LOOP;
END $$;

CREATE POLICY sessions_public_read ON sessions
  FOR SELECT TO anon, authenticated
  USING (status <> 'draft' OR (show_coming_soon AND opens_at > now()));
