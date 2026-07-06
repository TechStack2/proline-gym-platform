-- ============================================================
-- CI PROOF (AUTH-PRIMITIVES / migration 000089) — role helpers follow profiles.gym_id
--
-- Runs against the from-zero replayed DB (.github/workflows/db-replay-check.yml).
-- Proves the multi-gym privilege-bleed is closed: an identity holding an OWNER role
-- in gym A and a COACH role in gym B resolves its role/admin from its CURRENT gym
-- (profiles.gym_id = get_user_gym_id()), NOT an arbitrary gym.
--
--   Scenario A — profiles.gym_id = A  ⇒ get_user_role() = 'owner', is_gym_admin() = true
--   Scenario B — profiles.gym_id = B  ⇒ get_user_role() = 'coach', is_gym_admin() = false
--
-- Impersonation: SET LOCAL ROLE authenticated + set_config('request.jwt.claims', …)
-- so auth.uid() resolves to the test user; the SECURITY DEFINER helpers then read
-- user_roles/profiles as their definer. Everything runs in a transaction that is
-- ROLLBACK'd, so no test data persists (and on any RAISE, ON_ERROR_STOP aborts +
-- the aborted txn is discarded). RAISE EXCEPTION on any mismatch → job goes red.
--
-- Fixed UUIDs (deterministic, no collision with the 000006 seed). The auth.users
-- insert carries raw_user_meta_data.gym_id = A so the on_auth_user_created trigger
-- (000017 handle_new_user) creates the profile in gym A; user_roles are added
-- explicitly (owner@A, coach@B). is_active defaults true.
-- ============================================================

\echo '── AUTH-PRIMITIVES proof — role/admin scope to profiles.gym_id (multi-gym identity) ──'

BEGIN;

-- Two isolated gyms (as the superuser session → bypasses RLS).
INSERT INTO gyms (id, name_ar, name_en, name_fr, slug) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'AP Gym A', 'AP Gym A', 'AP Gym A', 'authprim-gym-a'),
  ('b0000000-0000-4000-8000-00000000000b', 'AP Gym B', 'AP Gym B', 'AP Gym B', 'authprim-gym-b');

-- The identity. metadata.gym_id = A → handle_new_user() creates profiles(id, gym_id=A).
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c0000000-0000-4000-8000-00000000000c',
  'authenticated', 'authenticated', 'authprim-proof@e2e.local', 'x',
  now(), '{"provider":"email","providers":["email"]}',
  '{"gym_id":"a0000000-0000-4000-8000-00000000000a"}',
  now(), now(), '', '', '', ''
);

-- The cross-gym roles: OWNER in A, COACH in B (the bleed the fix must contain).
INSERT INTO user_roles (user_id, gym_id, role, is_active) VALUES
  ('c0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000000a', 'owner', true),
  ('c0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-00000000000b', 'coach', true);

-- ── Scenario A: profiles.gym_id = A ⇒ owner / admin ──────────────────────────
DO $$
DECLARE v_role text; v_admin boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  v_role  := get_user_role();
  v_admin := is_gym_admin();
  RESET ROLE;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'AUTH-PRIMITIVES A1 FAIL: profile.gym_id=A but get_user_role()=% (expected owner)', coalesce(v_role,'<null>');
  END IF;
  IF v_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'AUTH-PRIMITIVES A2 FAIL: profile.gym_id=A but is_gym_admin()=% (expected true)', v_admin;
  END IF;
  RAISE NOTICE 'AUTH-PRIMITIVES scenario A (profile.gym_id=A): get_user_role()=%, is_gym_admin()=% — PASS', v_role, v_admin;
END $$;

-- ── Flip the identity's current gym to B (as superuser) ──────────────────────
UPDATE profiles SET gym_id = 'b0000000-0000-4000-8000-00000000000b'
  WHERE id = 'c0000000-0000-4000-8000-00000000000c';

-- ── Scenario B: profiles.gym_id = B ⇒ coach / NOT admin ──────────────────────
DO $$
DECLARE v_role text; v_admin boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  v_role  := get_user_role();
  v_admin := is_gym_admin();
  RESET ROLE;
  IF v_role IS DISTINCT FROM 'coach' THEN
    RAISE EXCEPTION 'AUTH-PRIMITIVES B1 FAIL: profile.gym_id=B but get_user_role()=% (expected coach)', coalesce(v_role,'<null>');
  END IF;
  IF v_admin IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'AUTH-PRIMITIVES B2 FAIL: profile.gym_id=B but is_gym_admin()=% (expected false)', v_admin;
  END IF;
  RAISE NOTICE 'AUTH-PRIMITIVES scenario B (profile.gym_id=B): get_user_role()=%, is_gym_admin()=% — PASS', v_role, v_admin;
END $$;

ROLLBACK;

\echo '✅ AUTH-PRIMITIVES proof PASSED — role + admin follow profiles.gym_id; no cross-gym privilege bleed.'
