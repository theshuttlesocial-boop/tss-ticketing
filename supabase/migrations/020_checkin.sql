-- ============================================================
-- Migration 020: check-in (Roadmap Phase 5b)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Session leads (and admins) tick people off as they arrive. Stored on the
-- booking with who did it. bookings keeps its existing RLS (no public read);
-- only the server writes these, after checking the staff member may run that
-- session.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_session_checkin ON bookings(session_id, checked_in_at);
