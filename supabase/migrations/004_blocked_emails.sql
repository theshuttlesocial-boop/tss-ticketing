-- Blocked emails: prevent specific addresses from booking
CREATE TABLE IF NOT EXISTS blocked_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blocked_emails_email_unique UNIQUE (email)
);

-- Service role only (no public access)
ALTER TABLE blocked_emails ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only the service role (used by supabaseAdmin) can read/write
