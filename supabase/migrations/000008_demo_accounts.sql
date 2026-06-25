-- ============================================================
-- 000008: DEMO ACCOUNTS
-- 4 accounts for MVP demo — one per portal type
-- 
-- IMPORTANT: Set the demo password before running this migration:
--   ALTER DATABASE postgres SET app.demo_password = 'your-secure-password';
-- Or in Supabase SQL Editor:
--   SELECT set_config('app.demo_password', 'your-secure-password', false);
-- 
-- These INSERTs use bcrypt hashing via extensions.crypt() with
-- current_setting('app.demo_password') so the plaintext is never
-- stored in source control.
-- ============================================================

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ISO-DB Phase 0: make this migration replay clean from ZERO (`supabase db reset`
-- on a fresh local stack / CI). The INSERTs below hash `current_setting('app.
-- demo_password')`, which previously had to be set out-of-band before applying
-- (see the header) — fine for the long-lived cloud project (set once), but a
-- from-scratch reset never sets it, so `current_setting('app.demo_password')` would
-- raise `unrecognized configuration parameter` and break the whole replay here.
-- Default it when unset; an explicit ALTER DATABASE / set_config still wins.
DO $$
BEGIN
  IF coalesce(current_setting('app.demo_password', true), '') = '' THEN
    PERFORM set_config('app.demo_password', 'DemoPass!23', false);
  END IF;
END $$;

-- Insert demo users directly into auth.users
-- Uses bcrypt hashing via extensions.crypt() and extensions.gen_salt()

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', 'owner@prolinegym.lb',
  extensions.crypt(current_setting('app.demo_password'), extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'owner@prolinegym.lb');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', 'coach@prolinegym.lb',
  extensions.crypt(current_setting('app.demo_password'), extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'coach@prolinegym.lb');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', 'reception@prolinegym.lb',
  extensions.crypt(current_setting('app.demo_password'), extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'reception@prolinegym.lb');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', 'student@prolinegym.lb',
  extensions.crypt(current_setting('app.demo_password'), extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'student@prolinegym.lb');

-- Assign roles
INSERT INTO user_roles (user_id, gym_id, role, is_primary)
SELECT u.id, g.id, 'owner', true
FROM auth.users u, gyms g
WHERE u.email = 'owner@prolinegym.lb' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'owner');

INSERT INTO user_roles (user_id, gym_id, role, is_primary)
SELECT u.id, g.id, 'coach', true
FROM auth.users u, gyms g
WHERE u.email = 'coach@prolinegym.lb' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'coach');

INSERT INTO user_roles (user_id, gym_id, role, is_primary)
SELECT u.id, g.id, 'receptionist', true
FROM auth.users u, gyms g
WHERE u.email = 'reception@prolinegym.lb' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'receptionist');

INSERT INTO user_roles (user_id, gym_id, role, is_primary)
SELECT u.id, g.id, 'student', true
FROM auth.users u, gyms g
WHERE u.email = 'student@prolinegym.lb' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'student');
