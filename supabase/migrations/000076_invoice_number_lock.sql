-- ============================================================
-- 000076: INVOICE-SEQ — race-safe invoice numbering (audit P1)
-- PRO LINE Gym Platform
--
-- WHY. generate_invoice_number() (000005) numbers with COUNT(*)+1 per gym+year,
-- and invoices.invoice_number is UNIQUE (000003). Two CONCURRENT issuances —
-- two staff at the desk, or a staff issue overlapping the 02:15 renewal tick —
-- can compute the same COUNT and collide: the loser gets a raw 23505
-- (duplicate key) and a FAILED money operation.
--
-- FIX. Serialize numbering per (gym, year) with a transaction-scoped advisory
-- lock taken BEFORE the COUNT. The second transaction blocks until the first
-- COMMITS (releasing the lock), and under READ COMMITTED its COUNT statement
-- then sees the first's committed row → distinct sequential numbers. A rollback
-- releases the lock without consuming a number. Zero schema change; the number
-- FORMAT (INV-<SLUG>-<YYYY>-<LPAD 5>) is preserved byte-for-byte. hashtext
-- collisions across gyms are harmless (spurious serialization only).
--
-- (A per-gym sequence table was considered and rejected: it changes replay/seed
-- shape and still needs the same locking discipline for the COUNT-derived
-- format; the advisory lock is the minimal sound fix.)
--
-- REWRITE BASE: 000005_create_triggers.sql is the ONLY definer of
-- generate_invoice_number in the migration history (000067 references it in a
-- comment only). Body below is 000005's, changed ONLY by the PERFORM line.
-- The trg_generate_invoice_number trigger (BEFORE INSERT ON invoices) keeps
-- pointing at this function — CREATE OR REPLACE preserves the wiring.
-- ADDITIVE + idempotent; replay-clean from zero.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  gym_slug TEXT;
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  SELECT slug INTO gym_slug FROM gyms WHERE id = NEW.gym_id;
  year_part := TO_CHAR(NOW(), 'YYYY');

  -- INVOICE-SEQ: serialize per (gym, year) — released at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.gym_id::text || '-' || year_part));

  SELECT COUNT(*) + 1 INTO seq_num
  FROM invoices
  WHERE gym_id = NEW.gym_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  NEW.invoice_number := 'INV-' || UPPER(gym_slug) || '-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$;
