-- ============================================================
-- OFF-3b — offline lead capture: idempotency key + discard audit
--
-- The front desk can now capture a walk-in lead OFFLINE (queued in Dexie, pushed
-- through addLead on reconnect). A reconnect double-fire / dropped-ACK re-push must
-- settle EXACTLY ONE lead, not a duplicate — so a client-generated `client_uuid`
-- rides with the queued intent and addLead de-dups on it (check-existing + a
-- partial-unique backstop). Mirrors OFF-3's 000062 payment key.
--
-- Plus discard_offline_lead: OFF-4's resolution loop generalized to leads — a
-- conflicted lead intent is discarded WITH an audit trail (never a silent drop).
--
-- Additive + forward-only. RLS untouched (addLead is an authed staff insert; the
-- discard writer is SECURITY DEFINER + is_staff, REVOKE PUBLIC + GRANT authenticated).
-- ============================================================

-- 1. Idempotency key (nullable: online single-fire + historical rows leave it NULL).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS leads_client_uuid_key
  ON leads (client_uuid) WHERE client_uuid IS NOT NULL;

-- 2. Discard a conflicted offline lead intent WITH an audit trail (the lead never
--    reached the server — there's no record_id — so scope by the staff actor's gym).
CREATE OR REPLACE FUNCTION discard_offline_lead(
  p_op_id  TEXT,
  p_name   TEXT,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Not authorized to discard leads';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A discard reason is required';
  END IF;

  INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES ('leads', NULL, 'delete',
          jsonb_build_object('op_id', p_op_id, 'name', p_name, 'source', 'offline_queue'),
          jsonb_build_object('action', 'offline_lead_discarded', 'reason', p_reason, 'discarded_at', now()),
          auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION discard_offline_lead(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION discard_offline_lead(TEXT, TEXT, TEXT) TO authenticated;
