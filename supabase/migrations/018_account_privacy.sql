-- ============================================================
-- Migration 018: delete my account + retention (Roadmap Phase 4d)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- anonymise_player(player): used by "Delete my account" and by retention.
--   - every live session they played: their name becomes "Former player"
--     (numbered if needed), the link to the account and any PIN are removed,
--     and their name is replaced in that session's change log. Games and
--     scores stay, so everyone else's history and ratings are unchanged.
--   - the account (players row) and the sign-in login (auth.users) are deleted.
--   Bookings, payments and credits are NOT touched: the law requires payment
--   records to be kept (6 years, UK tax). The privacy notice says so.
--
-- anonymise_inactive_players(): accounts with no sign-in, booking or live
--   session for 3 years are anonymised the same way. Also clears old
--   "Already registered?" attempt rows. Scheduled daily at 03:20 with pg_cron
--   when that extension is enabled (it is used by the waitlist jobs).
--
-- Both run only as the service role: execute is revoked from everyone else.
-- ============================================================

CREATE OR REPLACE FUNCTION public.anonymise_player(p_player UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r      RECORD;
  v_new  TEXT;
  n      INTEGER;
  v_auth UUID;
BEGIN
  SELECT auth_user_id INTO v_auth FROM players WHERE id = p_player;
  FOR r IN SELECT id, session_id, name FROM live_session_players WHERE player_id = p_player LOOP
    n := 1; v_new := 'Former player';
    WHILE EXISTS (SELECT 1 FROM live_session_players
                   WHERE session_id = r.session_id AND name = v_new AND id <> r.id) LOOP
      n := n + 1; v_new := 'Former player ' || n;
    END LOOP;
    UPDATE live_session_players SET name = v_new, player_id = NULL, pin_hash = NULL WHERE id = r.id;
    -- Names appear inside change-log entries as JSON strings ("Joe Bloggs");
    -- replace exactly that string, nothing else.
    UPDATE live_score_log
       SET detail = replace(detail::text, to_jsonb(r.name)::text, to_jsonb(v_new)::text)::jsonb
     WHERE session_id = r.session_id;
  END LOOP;
  DELETE FROM players WHERE id = p_player;
  IF v_auth IS NOT NULL THEN DELETE FROM auth.users WHERE id = v_auth; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.anonymise_inactive_players(p_years INTEGER DEFAULT 3)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
  n INTEGER := 0;
  cutoff TIMESTAMPTZ := now() - make_interval(years => p_years);
BEGIN
  FOR p IN
    SELECT pl.id FROM players pl
     WHERE pl.last_seen_at < cutoff
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE lower(b.email) = lower(pl.email) AND b.created_at > cutoff)
       AND NOT EXISTS (SELECT 1 FROM live_session_players l JOIN live_sessions s ON s.id = l.session_id
                        WHERE l.player_id = pl.id AND s.created_at > cutoff)
  LOOP
    PERFORM anonymise_player(p.id);
    n := n + 1;
  END LOOP;
  DELETE FROM live_pin_attempts WHERE created_at < now() - INTERVAL '1 day';
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.anonymise_player(UUID)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.anonymise_inactive_players(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymise_player(UUID)            TO service_role;
GRANT EXECUTE ON FUNCTION public.anonymise_inactive_players(INTEGER) TO service_role;

-- Daily at 03:20 (UTC). Skipped with a notice if pg_cron isn't enabled.
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('tss-account-retention'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('tss-account-retention', '20 3 * * *', 'SELECT public.anonymise_inactive_players()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%). Enable it in Database → Extensions, then run this file again.', SQLERRM;
END $$;
