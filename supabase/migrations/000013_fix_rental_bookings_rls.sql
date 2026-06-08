-- ============================================================
-- 000013: FIX RENTAL_BOOKINGS RLS GYM-SCOPING
-- PRO LINE Gym — Phase C Refinements (Prompt 15)
-- 
-- Fixes MEDIUM severity item: rental_bookings had a bare
-- is_staff() policy without gym_id verification via FK chain.
-- Pattern follows 000011_fix_rls_gym_scoping.sql which fixed
-- 8 other junction tables but missed this one.
-- ============================================================

-- Drop the existing broad staff policy on rental_bookings
DROP POLICY IF EXISTS rental_bookings_staff ON rental_bookings;

-- Re-create with gym scoping via rentals.gym_id FK chain
-- rental_bookings → rentals (rental_id) → gyms (gym_id)
CREATE POLICY rental_bookings_staff_gym ON rental_bookings
  FOR ALL
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM rentals
      WHERE rentals.id = rental_bookings.rental_id
      AND rentals.gym_id = get_user_gym_id()
    )
  );

-- NOTE: rental_bookings_external policy (external coaches see own bookings)
-- is left unchanged; it was already correctly scoped to the coach's identity.
