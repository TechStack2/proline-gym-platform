-- ============================================================
-- pgTAP test — PT Flow (Cycle 5 / Prompt 22 / Track A)
-- Run with:  supabase test db   (requires local Supabase / Docker)
--
-- Acceptance covered:
--   #1 request_pt creates a `requested` assignment for the calling student
--      AND a pt_requested notification readable by staff (not other gyms).
--   #4 increment_sessions_used: authorized (assigned coach) decrements;
--      unauthorized caller rejected; second call at 0 rejected.
-- (Approval → invoice + approve/assign notifications is TS-side; its dual-
--  currency invoice shape is unit-tested in src/lib/pt/invoice.test.ts.)
-- ============================================================

begin;
select plan(9);

set local role postgres;

-- Impersonation helper (public schema → no tests-schema dependency).
create or replace function public._test_auth_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;

-- --- Fixtures -----------------------------------------------
insert into gyms (id, name_ar, name_en, name_fr, slug) values
  ('11111111-1111-1111-1111-111111111111', 'صالة ١', 'Gym One', 'Salle Un', 'gym-one-pt'),
  ('22222222-2222-2222-2222-222222222222', 'صالة ٢', 'Gym Two', 'Salle Deux', 'gym-two-pt');

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'student1@g1.pt'),
  ('a0000000-0000-0000-0000-000000000002', 'coach1@g1.pt'),
  ('a0000000-0000-0000-0000-000000000003', 'owner@g1.pt'),
  ('a0000000-0000-0000-0000-000000000004', 'recept@g1.pt'),
  ('b0000000-0000-0000-0000-000000000001', 'student@g2.pt');

insert into profiles (id, gym_id, first_name_en) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sami'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Coach1'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Owner'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Recept'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'OtherGymStudent');

insert into user_roles (user_id, gym_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'student'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'coach'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'receptionist'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'student');

insert into students (id, profile_id, gym_id) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

insert into coaches (id, profile_id, gym_id) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111');

insert into pt_packages (id, gym_id, name_ar, name_en, name_fr, session_count, price_usd) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'باقة', 'Pack 5', 'Pack 5', 5, 200);

-- Two fixed-id active assignments used by the increment_sessions_used tests.
insert into pt_assignments (id, student_id, package_id, coach_id, sessions_total, sessions_used, status, is_active) values
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 5, 0, 'active', true),
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 0, 'active', true);

-- ============================================================
-- #1 request_pt — student requests a package
-- ============================================================
select public._test_auth_as('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ SELECT request_pt('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001') $$,
  'student can call request_pt'
);
select is(
  (select count(*)::int from pt_assignments
    where student_id = 'e0000000-0000-0000-0000-000000000001' and status = 'requested'),
  1,
  'request_pt creates exactly one requested assignment for the student'
);

-- staff (owner) sees the pt_requested notification
select public._test_auth_as('a0000000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from notifications where type = 'pt_requested'),
  1,
  'owner (staff) receives the pt_requested notification'
);

-- a user in another gym sees none of it
select public._test_auth_as('b0000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from notifications where type = 'pt_requested'),
  0,
  'a different-gym user cannot see the pt_requested notification'
);

-- ============================================================
-- #4 increment_sessions_used — authorization + decrement + exhaustion
-- ============================================================
-- unauthorized caller (other-gym student, neither staff here nor the coach)
select throws_ok(
  $$ SELECT increment_sessions_used('f0000000-0000-0000-0000-000000000002') $$,
  'Unauthorized increment is rejected'
);

-- assigned coach can log a session → remaining drops by 1
select public._test_auth_as('a0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ SELECT increment_sessions_used('f0000000-0000-0000-0000-000000000002') $$,
  'assigned coach can log a PT session'
);
select is(
  (select sessions_remaining from pt_assignments where id = 'f0000000-0000-0000-0000-000000000002'),
  4,
  'sessions_remaining decremented from 5 to 4'
);

-- exhaustion: single-session assignment → first ok, second rejected
select lives_ok(
  $$ SELECT increment_sessions_used('f0000000-0000-0000-0000-000000000001') $$,
  'coach logs the only session on a 1-session assignment'
);
select throws_ok(
  $$ SELECT increment_sessions_used('f0000000-0000-0000-0000-000000000001') $$,
  'logging a session on an exhausted assignment is rejected'
);

select * from finish();
rollback;
