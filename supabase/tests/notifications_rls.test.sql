-- ============================================================
-- pgTAP RLS test — Notification Producer Layer (Cycle 5 / Prompt 21)
-- Run with:  supabase test db   (requires local Supabase / Docker)
--
-- Acceptance covered:
--   #1 Recipient-scoped delivery — recipient SELECTs own; other gym cannot.
--   #2 Role fan-out — staff sees only same-gym role holders; inserting one
--      notification per holder is gym-scoped (no cross-gym row).
--   + same-gym INSERT RLS: staff -> student in own gym OK; cross-gym blocked.
--
-- Impersonation pattern: set role authenticated + request.jwt.claims.sub so
-- auth.uid() resolves to the test user.
-- ============================================================

begin;
select plan(8);

-- --- Fixtures (created as superuser, bypassing RLS) ----------
set local role postgres;

-- Two gyms
insert into gyms (id, name_ar, name_en, name_fr, slug) values
  ('11111111-1111-1111-1111-111111111111', 'صالة ١', 'Gym One', 'Salle Un', 'gym-one'),
  ('22222222-2222-2222-2222-222222222222', 'صالة ٢', 'Gym Two', 'Salle Deux', 'gym-two');

-- Auth users (profiles.id and notifications.user_id FK -> auth.users.id)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'staff1@g1.test'),   -- receptionist, gym 1
  ('aaaaaaaa-0000-0000-0000-000000000002', 'recept2@g1.test'),  -- receptionist, gym 1
  ('aaaaaaaa-0000-0000-0000-000000000003', 'student@g1.test'),  -- student, gym 1
  ('bbbbbbbb-0000-0000-0000-000000000001', 'staff@g2.test'),    -- receptionist, gym 2
  ('bbbbbbbb-0000-0000-0000-000000000002', 'student@g2.test');  -- student, gym 2

-- Profiles (gym scope lives here)
insert into profiles (id, gym_id, first_name_en) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Staff1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Recept2'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Student1'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'StaffG2'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'StudentG2');

-- Roles
insert into user_roles (user_id, gym_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'receptionist'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'receptionist'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'student'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'receptionist'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'student');

-- ============================================================
-- Helper to impersonate an authenticated user
-- ============================================================
create or replace function tests._auth_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;

-- ============================================================
-- #1 + INSERT RLS — staff in G1 inserts notification to student in G1
-- ============================================================
select tests._auth_as('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$insert into notifications (user_id, gym_id, type, title_key, body_key, params)
    values ('aaaaaaaa-0000-0000-0000-000000000003',
            '11111111-1111-1111-1111-111111111111',
            'enrollment_confirmed',
            'messages.enrollment_confirmed.title',
            'messages.enrollment_confirmed.body',
            '{"className":"BJJ"}'::jsonb)$$,
  'staff can INSERT a notification to a student in the SAME gym'
);

-- cross-gym INSERT must be blocked by WITH CHECK
select throws_ok(
  $$insert into notifications (user_id, gym_id, type, title_key, body_key)
    values ('bbbbbbbb-0000-0000-0000-000000000002',
            '22222222-2222-2222-2222-222222222222',
            'enrollment_confirmed',
            'messages.enrollment_confirmed.title',
            'messages.enrollment_confirmed.body')$$,
  '42501',
  null,
  'staff CANNOT INSERT a notification into another gym (cross-gym blocked)'
);

-- staff cannot address a recipient outside their own gym, even tagging own gym_id
select throws_ok(
  $$insert into notifications (user_id, gym_id, type, title_key, body_key)
    values ('bbbbbbbb-0000-0000-0000-000000000002',
            '11111111-1111-1111-1111-111111111111',
            'enrollment_confirmed',
            'messages.enrollment_confirmed.title',
            'messages.enrollment_confirmed.body')$$,
  '42501',
  null,
  'staff CANNOT address a recipient who belongs to a different gym'
);

-- ============================================================
-- #1 Recipient-scoped delivery
-- ============================================================
-- recipient (student in G1) sees their own notification
select tests._auth_as('aaaaaaaa-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from notifications
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  1,
  'recipient student SELECTs their own notification'
);

-- a user in another gym cannot see it
select tests._auth_as('bbbbbbbb-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from notifications),
  0,
  'a different user in another gym CANNOT see the notification'
);

-- the sending staff (not the recipient) also cannot see it (self-only SELECT)
select tests._auth_as('aaaaaaaa-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from notifications),
  0,
  'staff sender cannot SELECT a notification addressed to someone else'
);

-- ============================================================
-- #2 Role fan-out underpinning — same-gym receptionists only
-- ============================================================
-- staff in G1 sees exactly the two G1 receptionists (none from G2)
select is(
  (select count(*)::int from user_roles
    where role = 'receptionist'
      and gym_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'fan-out source: exactly 2 receptionists visible in G1 to G1 staff'
);

-- and fanning out one notification per G1 receptionist succeeds for all of them
select lives_ok(
  $$insert into notifications (user_id, gym_id, type, title_key, body_key)
    select ur.user_id,
           '11111111-1111-1111-1111-111111111111',
           'lead_new',
           'messages.lead_new.title',
           'messages.lead_new.body'
    from user_roles ur
    where ur.role = 'receptionist'
      and ur.gym_id = '11111111-1111-1111-1111-111111111111'$$,
  'fan-out: staff can INSERT one notification per same-gym receptionist'
);

select * from finish();
rollback;
