-- ============================================================
-- TSS TICKETING — Phase 4: settlement + audit
--
-- A card refund of only SOME spaces sets bookings.stripe_status =
-- 'partially_refunded'. Such a booking still occupies its remaining seats
-- (quantity - spaces_released), so availability must keep counting it.
-- We fold 'partially_refunded' into the same net count as 'succeeded'.
--
-- Safe to run twice.
-- ============================================================

-- ── Seat-hold gate counts succeeded + partially_refunded (net of released) ───
CREATE OR REPLACE FUNCTION claim_seat_hold(
  p_session_id  UUID,
  p_quantity    INTEGER,
  p_hold_token  TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacity    INTEGER;
  v_booked      INTEGER;
  v_held        INTEGER;
  v_available   INTEGER;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  SELECT capacity INTO v_capacity
  FROM sessions
  WHERE id = p_session_id
    -- Open, or a scheduled-release draft whose opens_at has passed (matches 017).
    AND (status = 'open' OR (status = 'draft' AND opens_at IS NOT NULL AND opens_at <= now()))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Session not available');
  END IF;

  SELECT COALESCE(SUM(quantity - COALESCE(spaces_released, 0)), 0) INTO v_booked
  FROM bookings
  WHERE session_id = p_session_id AND stripe_status IN ('succeeded','partially_refunded');

  SELECT COALESCE(SUM(quantity), 0) INTO v_held
  FROM seat_holds
  WHERE session_id = p_session_id AND used = false AND expires_at > now();

  v_available := v_capacity - v_booked - v_held;

  IF v_available < p_quantity THEN
    RETURN json_build_object('success', false, 'error', 'Not enough spots available', 'available', v_available);
  END IF;

  v_expires_at := now() + INTERVAL '10 minutes';
  INSERT INTO seat_holds (session_id, quantity, hold_token, expires_at)
  VALUES (p_session_id, p_quantity, p_hold_token, v_expires_at);

  RETURN json_build_object('success', true, 'hold_token', p_hold_token,
    'expires_at', v_expires_at::TEXT, 'available_after_hold', v_available - p_quantity);
END;
$$;

-- ── Hard capacity trigger counts succeeded + partially_refunded (net) ────────
CREATE OR REPLACE FUNCTION check_capacity_not_exceeded()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_capacity INTEGER;
  v_booked   INTEGER;
BEGIN
  SELECT capacity INTO v_capacity FROM sessions WHERE id = NEW.session_id;

  SELECT COALESCE(SUM(quantity - COALESCE(spaces_released, 0)), 0) INTO v_booked
  FROM bookings
  WHERE session_id = NEW.session_id
    AND stripe_status IN ('succeeded','partially_refunded')
    AND id != NEW.id;

  IF v_booked + (NEW.quantity - COALESCE(NEW.spaces_released, 0)) > v_capacity THEN
    RAISE EXCEPTION 'capacity_exceeded: session % is full (booked=%, new=%, capacity=%)',
      NEW.session_id, v_booked, (NEW.quantity - COALESCE(NEW.spaces_released, 0)), v_capacity;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger fires for succeeded OR partially_refunded confirmations.
DROP TRIGGER IF EXISTS enforce_capacity ON bookings;
CREATE TRIGGER enforce_capacity
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  WHEN (NEW.stripe_status IN ('succeeded','partially_refunded'))
  EXECUTE FUNCTION check_capacity_not_exceeded();

-- ── Audit log: every offer, claim, transfer and settlement ──────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event      TEXT NOT NULL,     -- offer | claim_attempt | claim_success | transfer_requested | transfer_confirmed | settlement | release
  entity     TEXT,              -- related id (waitlist / release / booking), free-form
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log (event, created_at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- No policies = service role only.
