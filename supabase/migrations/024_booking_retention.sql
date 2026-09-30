-- ============================================================
-- Migration 024: booking-data retention (privacy notice promise)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- The privacy notice says bookings and payments are kept 6 years (UK tax),
-- then deleted. anonymise_old_booking_data() keeps that promise:
--   - bookings older than 6 years: name becomes "Former player", email is
--     emptied, phone, extra attendees and check-in staff are removed. The
--     money side (amount, quantity, reference, Stripe id, session) stays so
--     past totals are still correct, but nobody can be identified from it.
--   - credits and ticket transfers older than 6 years: the same for their
--     names, emails and phones.
--   - audit log entries older than 6 years are deleted (they can hold emails).
--   - waitlist entries are not payments, so they are deleted after 1 year.
--   - sign-in links and "find my booking" attempts are deleted after 1 day
--     (they are only ever valid for minutes).
--
-- Scheduled daily at 03:30 with pg_cron, next to the 03:20 account job
-- (migration 018). Runs only as the service role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.anonymise_old_booking_data(p_years INTEGER DEFAULT 6)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff    TIMESTAMPTZ := now() - make_interval(years => p_years);
  n_book    INTEGER; n_credit INTEGER; n_transfer INTEGER;
  n_audit   INTEGER; n_wait   INTEGER;
BEGIN
  UPDATE bookings
     SET name = 'Former player', email = '', phone = NULL,
         additional_attendees = NULL, checked_in_by = NULL
   WHERE created_at < cutoff AND email <> '';
  GET DIAGNOSTICS n_book = ROW_COUNT;

  UPDATE credits SET email = '', phone = NULL
   WHERE created_at < cutoff AND email <> '';
  GET DIAGNOSTICS n_credit = ROW_COUNT;

  UPDATE ticket_transfers
     SET from_name = 'Former player', from_email = '',
         to_name = 'Former player', to_email = '', to_phone = NULL
   WHERE requested_at < cutoff AND from_email <> '';
  GET DIAGNOSTICS n_transfer = ROW_COUNT;

  DELETE FROM audit_log WHERE created_at < cutoff;
  GET DIAGNOSTICS n_audit = ROW_COUNT;

  DELETE FROM waitlist WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS n_wait = ROW_COUNT;

  DELETE FROM release_magic_links     WHERE created_at < now() - INTERVAL '1 day';
  DELETE FROM release_lookup_attempts WHERE created_at < now() - INTERVAL '1 day';

  RETURN jsonb_build_object('bookings', n_book, 'credits', n_credit, 'transfers', n_transfer,
                            'audit_log', n_audit, 'waitlist', n_wait);
END $$;

REVOKE ALL ON FUNCTION public.anonymise_old_booking_data(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymise_old_booking_data(INTEGER) TO service_role;

-- Daily at 03:30 (UTC). Skipped with a notice if pg_cron isn't enabled.
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('tss-booking-retention'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('tss-booking-retention', '30 3 * * *', 'SELECT public.anonymise_old_booking_data()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%). Enable it in Database → Extensions, then run this file again.', SQLERRM;
END $$;
