-- ============================================================
-- TSS TICKETING — Phase 3: scheduled waitlist jobs (pg_cron + pg_net)
--
-- These jobs call the app's cron endpoints, which run the TypeScript cascade /
-- settlement logic. Two placeholders must be substituted before running this in
-- the Supabase SQL editor (do NOT commit the real secret):
--   <<APP_URL>>     e.g. https://tss-ticketing.vercel.app   (no trailing slash)
--   <<CRON_SECRET>> the same value set as CRON_SECRET in the app's env
--
-- Prerequisites (enable once, in Supabase → Database → Extensions):
--   - pg_cron
--   - pg_net
--
-- Safe to run twice: each job is unscheduled (if present) before re-scheduling.
-- ============================================================

-- Every 2 minutes: expire stale offers and re-run the cascade for any session
-- that still has an unfilled release.
DO $$ BEGIN PERFORM cron.unschedule('waitlist-cascade'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('waitlist-cascade', '*/2 * * * *', $CRON$
  SELECT net.http_post(
    url     := '<<APP_URL>>/api/cron/cascade',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<<CRON_SECRET>>'),
    body    := '{}'::jsonb
  );
$CRON$);

-- Every 5 minutes: resolve releases whose session has started with no
-- replacement (outcome -> 'unfilled', booking -> 'expired_unfilled', email releaser).
DO $$ BEGIN PERFORM cron.unschedule('release-session-start'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('release-session-start', '*/5 * * * *', $CRON$
  SELECT net.http_post(
    url     := '<<APP_URL>>/api/cron/session-start',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<<CRON_SECRET>>'),
    body    := '{}'::jsonb
  );
$CRON$);

-- To inspect:   SELECT * FROM cron.job;
-- To remove:    SELECT cron.unschedule('waitlist-cascade');
--               SELECT cron.unschedule('release-session-start');
