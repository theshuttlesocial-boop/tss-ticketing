-- ============================================================
-- TSS TICKETING — Phase 2: release availability + atomic release
-- Safe to run twice (idempotent).
--
-- Released spaces (bookings.spaces_released) must read as available
-- everywhere availability is computed: the seat-hold gate and the
-- hard capacity trigger. Effective occupancy = quantity - spaces_released.
-- ============================================================

-- ── 1. Seat-hold gate counts net (quantity - spaces_released) ───────────────
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

  -- Net confirmed bookings: released spaces are free again
  SELECT COALESCE(SUM(quantity - COALESCE(spaces_released, 0)), 0) INTO v_booked
  FROM bookings
  WHERE session_id = p_session_id AND stripe_status IN ('succeeded','partially_refunded');

  SELECT COALESCE(SUM(quantity), 0) INTO v_held
  FROM seat_holds
  WHERE session_id = p_session_id
    AND used = false
    AND expires_at > now();

  v_available := v_capacity - v_booked - v_held;

  IF v_available < p_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not enough spots available',
      'available', v_available
    );
  END IF;

  v_expires_at := now() + INTERVAL '10 minutes';

  INSERT INTO seat_holds (session_id, quantity, hold_token, expires_at)
  VALUES (p_session_id, p_quantity, p_hold_token, v_expires_at);

  RETURN json_build_object(
    'success', true,
    'hold_token', p_hold_token,
    'expires_at', v_expires_at::TEXT,
    'available_after_hold', v_available - p_quantity
  );
END;
$$;

-- ── 2. Hard capacity trigger counts net too ─────────────────────────────────
--    Without this, a replacement booking on a freed spot would be blocked
--    because the releaser's full quantity would still be counted.
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

-- Trigger definition unchanged; re-assert idempotently.
DROP TRIGGER IF EXISTS enforce_capacity ON bookings;
CREATE TRIGGER enforce_capacity
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  WHEN (NEW.stripe_status IN ('succeeded','partially_refunded'))
  EXECUTE FUNCTION check_capacity_not_exceeded();

-- ── 3. Atomic release: guards over-release + double-release under a row lock ─
CREATE OR REPLACE FUNCTION create_release(
  p_booking_id UUID,
  p_spaces     INTEGER,
  p_pref       TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_quantity        INTEGER;
  v_spaces_released INTEGER;
  v_release_status  TEXT;
  v_session_id      UUID;
  v_release_id      UUID;
BEGIN
  IF p_pref NOT IN ('credit', 'card') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_preference');
  END IF;
  IF p_spaces < 1 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_spaces');
  END IF;

  -- Lock the booking row so two concurrent releases can't both pass the check
  SELECT quantity, COALESCE(spaces_released, 0), release_status, session_id
    INTO v_quantity, v_spaces_released, v_release_status, v_session_id
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  IF v_release_status NOT IN ('none', 'pending_replacement') THEN
    RETURN json_build_object('success', false, 'error', 'not_releasable');
  END IF;

  IF v_spaces_released + p_spaces > v_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'exceeds_booked',
      'max_releasable', v_quantity - v_spaces_released
    );
  END IF;

  INSERT INTO releases (booking_id, session_id, spaces, refund_preference)
  VALUES (p_booking_id, v_session_id, p_spaces, p_pref)
  RETURNING id INTO v_release_id;

  UPDATE bookings
  SET spaces_released = v_spaces_released + p_spaces,
      release_status  = 'pending_replacement'
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'release_id', v_release_id,
    'session_id', v_session_id
  );
END;
$$;

-- ── 4. Rate-limit ledger for the release lookup (booking-ref enumeration) ────
CREATE TABLE IF NOT EXISTS release_lookup_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_release_lookup_ip ON release_lookup_attempts (ip, created_at);
ALTER TABLE release_lookup_attempts ENABLE ROW LEVEL SECURITY;
-- No policies = service role only.
