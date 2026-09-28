-- ============================================================
-- TSS TICKETING — Phase 2 hardening: magic-link release access
--
-- Instead of showing a booking from an email alone, the release flow emails a
-- short-lived link to that address. Only the inbox owner can act on the booking.
-- Safe to run twice.
-- ============================================================
CREATE TABLE IF NOT EXISTS release_magic_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  token      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_release_magic_token ON release_magic_links (token);

ALTER TABLE release_magic_links ENABLE ROW LEVEL SECURITY;
-- No policies = service role only.
