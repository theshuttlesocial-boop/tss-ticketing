-- ============================================================
-- Migration 022: keep level-review notes private
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- live_sessions is readable with the public key (the board and player pages
-- need its name and status). Its config held two admin-only notes from level
-- review — dismissed suggestions and undone moves, e.g. "player X: move to
-- Strong" — which would have let anyone with the public key learn a player's
-- level. They move here: RLS on, no policies, server only.
-- ============================================================

CREATE TABLE IF NOT EXISTS live_session_private (
  session_id    UUID PRIMARY KEY REFERENCES live_sessions(id) ON DELETE CASCADE,
  dismissed     JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked_moves JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE live_session_private ENABLE ROW LEVEL SECURITY;

-- Move anything already stored in the public config, then remove it there.
INSERT INTO live_session_private (session_id, dismissed, blocked_moves)
SELECT id, COALESCE(config->'dismissed', '[]'::jsonb), COALESCE(config->'blockedMoves', '[]'::jsonb)
  FROM live_sessions
 WHERE config ? 'dismissed' OR config ? 'blockedMoves'
ON CONFLICT (session_id) DO NOTHING;

UPDATE live_sessions SET config = config - 'dismissed' - 'blockedMoves'
 WHERE config ? 'dismissed' OR config ? 'blockedMoves';
