-- ============================================================
-- Migration 019: staff roles (Roadmap Phase 5a)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Replaces the single shared admin password with personal logins. Staff sign
-- in with the same emailed code as My TSS; their access comes from here.
--
-- staff: one row per person, keyed by EMAIL so someone can be invited before
--   they have signed in. role = owner | admin | session_lead. Revoking sets
--   active = false (and revoked_at) — access ends on their next request.
-- session_leads: which sessions a session lead may run, and when. Either a
--   live session or a booking session, with an optional time window.
--
-- Both tables: RLS on, no policies — only the server (service role) reads them.
-- The first owner is theshuttlesocial@gmail.com.
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner','admin','session_lead')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_email_lower_key ON staff (lower(email));
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS session_leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  live_session_id   UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  ticket_session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  valid_from        TIMESTAMPTZ,
  valid_to          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_leads_one_session CHECK (live_session_id IS NOT NULL OR ticket_session_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_session_leads_staff ON session_leads(staff_id);
ALTER TABLE session_leads ENABLE ROW LEVEL SECURITY;

INSERT INTO staff (email, role, created_by)
SELECT 'theshuttlesocial@gmail.com', 'owner', 'migration 019'
WHERE NOT EXISTS (SELECT 1 FROM staff WHERE lower(email) = 'theshuttlesocial@gmail.com');
